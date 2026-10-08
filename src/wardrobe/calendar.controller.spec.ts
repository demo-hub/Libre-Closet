import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

describe('CalendarController', () => {
  let controller: CalendarController;
  let calendarService: { toggleWorn: jest.Mock; remove: jest.Mock };
  let reply: {
    header: jest.Mock;
    send: jest.Mock;
    redirect: jest.Mock;
    viewPartial: jest.Mock;
  };

  const request = (htmx: boolean) =>
    ({
      user: undefined,
      headers: htmx ? { 'hx-request': 'true' } : {},
    }) as unknown as FastifyRequest;

  beforeEach(async () => {
    calendarService = {
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
        '/calendar?week=2026-03-02',
        303,
      );
    });
  });

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
        '/calendar?week=2026-03-02',
        303,
      );
    });
  });
});
