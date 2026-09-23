import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { I18nService } from 'nestjs-i18n';
import { ErrorViewFilter } from './error-view.filter';
import { ViewContextService } from './view-context/view-context.service';

const i18n = {
  t: (key: string, options?: { lang?: string }) => `${key}@${options?.lang}`,
} as unknown as I18nService;
const viewContext = {
  buildContext: jest.fn(),
} as unknown as ViewContextService;

async function render(exception: unknown, locale = 'en', fail = false) {
  const reply = {
    sent: false,
    locals: { locale },
    status: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    view: fail
      ? jest.fn().mockRejectedValue(new Error('template broke'))
      : jest.fn().mockResolvedValue(undefined),
    send: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ url: '/nope' }),
    }),
  } as unknown as ArgumentsHost;
  await new ErrorViewFilter(viewContext, i18n).catch(exception, host);
  const data = reply.view.mock.calls[0]?.[1] as Record<string, unknown>;
  return { reply, data };
}

describe('the error page', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T14:05:00Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it.each([
    [new UnauthorizedException(), 401, 'lang.ERROR_401@de'],
    [new ForbiddenException(), 403, 'lang.ERROR_403@de'],
    [new NotFoundException('Garment not found'), 404, 'lang.ERROR_404@de'],
    [new ThrottlerException(), 429, 'lang.ERROR_429@de'],
    [new Error('boom'), 500, 'lang.ERROR_500@de'],
    [new HttpException('upstream down', 503), 503, 'lang.ERROR_500@de'],
  ])(
    'explains %s in the reader’s language',
    async (exception, status, message) => {
      const { reply, data } = await render(exception, 'de');
      expect(reply.status).toHaveBeenCalledWith(status);
      expect(data.message).toBe(message);
      expect(data.pageTitle).toBe(`lang.ERROR@de ${status}`);
    },
  );

  it('falls back to the exception message for a status it has no words for', async () => {
    const { data } = await render(new BadRequestException('Validation failed'));
    expect(data.message).toBe('Validation failed');
  });

  it.each(['en', 'de', 'es', 'fr', 'it', 'ru'])(
    'dates the error in %s without the formatter throwing',
    async (locale) => {
      const { reply, data } = await render(new NotFoundException(), locale);
      expect(reply.send).not.toHaveBeenCalled();
      expect(data.timestamp).toMatch(/2026/);
      expect(data.timestampIso).toBe('2026-09-11T14:05:00.000Z');
    },
  );

  it('writes the date the British way in English', async () => {
    const { data } = await render(new NotFoundException());
    expect(data.timestamp).toMatch(/^11 September 2026/);
  });

  it('is never cached, whatever the route set', async () => {
    const { reply } = await render(new NotFoundException());
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(reply.type).toHaveBeenCalledWith('text/html; charset=utf-8');
  });

  it('answers with JSON when the page itself cannot render', async () => {
    const { reply } = await render(new NotFoundException('gone'), 'en', true);
    expect(reply.type).toHaveBeenLastCalledWith('application/json');
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'gone',
    });
  });
});
