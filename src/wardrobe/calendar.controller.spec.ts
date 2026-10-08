import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

describe('CalendarController', () => {
  let controller: CalendarController;
  let calendarService: {
    buildIndexViewModel: jest.Mock;
    toggleWorn: jest.Mock;
    remove: jest.Mock;
  };
  let reply: {
    header: jest.Mock;
    send: jest.Mock;
    redirect: jest.Mock;
    viewPartial: jest.Mock;
  };

  const request = (htmx: boolean, trigger?: string) =>
    ({
      user: undefined,
      headers: htmx ? { 'hx-request': 'true', 'hx-trigger': trigger } : {},
    }) as unknown as FastifyRequest;

  beforeEach(async () => {
    calendarService = {
      buildIndexViewModel: jest.fn().mockResolvedValue({
        days: [{ dateParam: '2026-03-03' }, { dateParam: '2026-03-04' }],
      }),
      toggleWorn: jest.fn().mockResolvedValue({ wornAt: new Date() }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    reply = {
      header: jest.fn(),
      send: jest.fn(),
      redirect: jest.fn(),
      viewPartial: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [{ provide: CalendarService, useValue: calendarService }],
    })
      .overrideGuard(ConditionalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CalendarController);
  });

  describe('the week', () => {
    it('takes the focus to a day picked in the month', async () => {
      const vm = await controller.index(
        '2026-03-04',
        undefined,
        request(true, 'cal-day-2026-03-04'),
        {} as never,
      );

      expect(vm.days.map((day) => day.focus)).toEqual([false, true]);
    });

    it.each([
      ['a plain load', request(false)],
      ['another link', request(true, 'cal-next-month')],
    ])(
      'leaves the focus alone after %s',
      async (_: string, req: FastifyRequest) => {
        const vm = await controller.index(
          '2026-03-04',
          undefined,
          req,
          {} as never,
        );

        expect(vm.days.some((day) => day.focus)).toBe(false);
      },
    );
  });

  describe('the worn toggle', () => {
    it('answers htmx with the toggle, rendered from the stored state', async () => {
      await controller.toggleWorn(
        3,
        { week: '2026-03-02', worn: 'true' },
        request(true),
        reply as unknown as FastifyReply,
      );

      expect(calendarService.toggleWorn).toHaveBeenCalledWith(
        3,
        undefined,
        true,
      );
      expect(reply.viewPartial).toHaveBeenCalledWith(
        'partials/calendar_worn_button',
        expect.objectContaining({ entryId: 3, week: '2026-03-02', worn: true }),
      );
    });

    it('passes on an unmark', async () => {
      calendarService.toggleWorn.mockResolvedValue({ wornAt: undefined });

      await controller.toggleWorn(
        3,
        { week: '2026-03-02', worn: 'false' },
        request(true),
        reply as unknown as FastifyReply,
      );

      expect(calendarService.toggleWorn).toHaveBeenCalledWith(
        3,
        undefined,
        false,
      );
      expect(reply.viewPartial).toHaveBeenCalledWith(
        'partials/calendar_worn_button',
        expect.objectContaining({ worn: false }),
      );
    });

    it('renders the state the entry ended in, not the one asked for', async () => {
      calendarService.toggleWorn.mockResolvedValue({ wornAt: undefined });

      await controller.toggleWorn(
        3,
        { week: '2026-03-02', worn: 'true' },
        request(true),
        reply as unknown as FastifyReply,
      );

      expect(reply.viewPartial).toHaveBeenCalledWith(
        'partials/calendar_worn_button',
        expect.objectContaining({ worn: false }),
      );
    });

    it.each([['yes'], [['true', 'false']], ['TRUE']])(
      'refuses the state %p without changing the entry',
      async (worn: unknown) => {
        await expect(
          controller.toggleWorn(
            3,
            { week: '2026-03-02', worn } as never,
            request(true),
            reply as unknown as FastifyReply,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(calendarService.toggleWorn).not.toHaveBeenCalled();
      },
    );

    it('takes JSON booleans as well as form strings', async () => {
      await controller.toggleWorn(
        3,
        { worn: false },
        request(true),
        reply as unknown as FastifyReply,
      );

      expect(calendarService.toggleWorn).toHaveBeenCalledWith(
        3,
        undefined,
        false,
      );
    });

    it('flips the state when the request names none', async () => {
      await controller.toggleWorn(
        3,
        { week: '2026-03-02' },
        request(false),
        reply as unknown as FastifyReply,
      );

      expect(calendarService.toggleWorn).toHaveBeenCalledWith(
        3,
        undefined,
        undefined,
      );
    });

    it('sends a page without JavaScript back to the week', async () => {
      await controller.toggleWorn(
        3,
        { week: '2026-03-02', worn: 'true' },
        request(false),
        reply as unknown as FastifyReply,
      );

      expect(reply.viewPartial).not.toHaveBeenCalled();
      expect(reply.redirect).toHaveBeenCalledWith(
        '/calendar?week=2026-03-02#day-2026-03-02',
        303,
      );
    });
  });

  it.each([
    ['a week that is not a date', { week: '2026-03-02%0d%0aX: y' }],
    ['no week', {}],
    ['no body at all', undefined],
  ])(
    'sends %s back to the current week',
    async (_: string, body?: { week?: string }) => {
      await controller.remove(
        3,
        body,
        request(false),
        reply as unknown as FastifyReply,
      );
      await controller.toggleWorn(
        3,
        body,
        request(false),
        reply as unknown as FastifyReply,
      );

      expect(reply.redirect).toHaveBeenNthCalledWith(1, '/calendar', 303);
      expect(reply.redirect).toHaveBeenNthCalledWith(2, '/calendar', 303);
    },
  );

  describe('removing an entry', () => {
    it('sends htmx back to the week', async () => {
      await controller.remove(
        3,
        { week: '2026-03-02' },
        request(true),
        reply as unknown as FastifyReply,
      );

      expect(calendarService.remove).toHaveBeenCalledWith(3, undefined);
      expect(reply.header).toHaveBeenCalledWith(
        'HX-Redirect',
        '/calendar?week=2026-03-02',
      );
      expect(reply.redirect).not.toHaveBeenCalled();
    });

    it('redirects a page without JavaScript instead of leaving it blank', async () => {
      await controller.remove(
        3,
        { week: '2026-03-02' },
        request(false),
        reply as unknown as FastifyReply,
      );

      expect(reply.header).not.toHaveBeenCalled();
      expect(reply.redirect).toHaveBeenCalledWith(
        '/calendar?week=2026-03-02#day-2026-03-02',
        303,
      );
    });
  });
});
