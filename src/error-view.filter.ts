import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { I18nService } from 'nestjs-i18n';
import { intlLocale } from './i18n/intl-locale';
import { ViewContextService } from './view-context/view-context.service';

const MESSAGE_KEYS: Partial<Record<number, string>> = {
  401: 'lang.ERROR_401',
  403: 'lang.ERROR_403',
  404: 'lang.ERROR_404',
  429: 'lang.ERROR_429',
  500: 'lang.ERROR_500',
};

// dateStyle cannot be combined with timeZoneName: the constructor throws.
const TIMESTAMP: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
  hourCycle: 'h23',
};

@Catch()
export class ErrorViewFilter implements ExceptionFilter {
  private logger = new Logger(ErrorViewFilter.name);

  constructor(
    private readonly viewContextService: ViewContextService,
    private readonly i18n: I18nService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    this.logger.warn(exception);

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    if (response.sent) {
      this.logger.warn('Response already sent, skipping error filter');
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';
    const fallback =
      typeof raw === 'string' ? raw : (raw as { message?: string }).message;

    try {
      const context =
        (response as any).locals ||
        (await this.viewContextService.buildContext(request));
      const lang: string = context.locale ?? 'en';
      const key = MESSAGE_KEYS[status >= 500 ? 500 : status];
      const now = new Date();
      // view() swallows its own render errors, so the page is rendered here and the fallback below can run.
      const html = await (
        response as FastifyReply & {
          viewAsync(page: string, data: object): Promise<string>;
        }
      ).viewAsync('error', {
        layout: 'layout',
        ...context,
        statusCode: status,
        message: key ? this.i18n.t(key, { lang }) : fallback,
        pageTitle: `${this.i18n.t('lang.ERROR', { lang })} ${status}`,
        timestamp: new Intl.DateTimeFormat(intlLocale(lang), TIMESTAMP).format(
          now,
        ),
        timestampIso: now.toISOString(),
        path: request.url,
      });
      response
        .status(status)
        .header('Cache-Control', 'no-store')
        .type('text/html; charset=utf-8')
        .send(html);
    } catch (renderError) {
      this.logger.error(renderError);
      response
        .status(status)
        .type('application/json')
        .send({ statusCode: status, message: fallback });
    }
  }
}
