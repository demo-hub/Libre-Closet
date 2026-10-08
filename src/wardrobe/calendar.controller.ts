import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Get,
  Query,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { Payload } from '../auth/dto/payload.dto';
import { CalendarService } from './calendar.service';

/** The YYYY-MM-DD week a form came from, or undefined for anything else. */
function validWeek(week: unknown): string | undefined {
  return typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week)
    ? week
    : undefined;
}

const calendarUrl = (week?: string) =>
  week ? `/calendar?week=${week}` : '/calendar';

/** The week scrolled to the day a form came from, for a page without JavaScript. */
const dayUrl = (week?: string) =>
  week ? `/calendar?week=${week}#day-${week}` : '/calendar';

/** The state a worn form asks for; a form that names none gets a flip. */
function parseWorn(worn: unknown): boolean | undefined {
  if (worn === undefined) return undefined;
  if (worn === true || worn === 'true') return true;
  if (worn === false || worn === 'false') return false;
  throw new BadRequestException('worn must be true or false');
}

@UseGuards(ConditionalAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  private userId(req: FastifyRequest): number | undefined {
    return (req['user'] as Payload | undefined)?.userId;
  }

  @Get()
  @Render('calendar/index')
  async index(
    @Query('week') weekParam: string | undefined,
    @Query('calMonth') calMonthParam: string | undefined,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
  ) {
    const viewModel = await this.calendarService.buildIndexViewModel(
      weekParam,
      calMonthParam,
      this.userId(req),
      i18n,
    );
    // htmx names the link it followed; a day picked in the month takes the focus to that day.
    const picked = /^cal-day-(\d{4}-\d{2}-\d{2})$/.exec(
      String(req.headers['hx-trigger'] ?? ''),
    )?.[1];
    return {
      ...viewModel,
      days: viewModel.days.map((day) => ({
        ...day,
        focus: day.dateParam === picked,
      })),
    };
  }

  @Post()
  async create(
    @Body()
    body: { date: string; outfitId: string; notes?: string; week?: string },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.calendarService.create(
      {
        date: new Date(body.date),
        outfitId: Number(body.outfitId),
        notes: body.notes,
      },
      this.userId(req),
    );
    if (req.headers['hx-request'] === 'true') {
      return reply.status(204).send();
    }
    return reply.redirect(calendarUrl(validWeek(body.week ?? body.date)), 302);
  }

  @Post(':id/delete')
  @HttpCode(200)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { week?: string } | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.calendarService.remove(id, this.userId(req));
    const week = validWeek(body?.week);
    if (req.headers['hx-request'] === 'true') {
      // No #day here: htmx sets location, and the same URL plus a fragment would not reload.
      reply.header('HX-Redirect', calendarUrl(week));
      return reply.send();
    }
    return reply.redirect(dayUrl(week), 303);
  }

  @Post(':id/worn')
  async toggleWorn(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { week?: string; worn?: string | boolean } | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const worn = parseWorn(body?.worn);
    const week = validWeek(body?.week);
    const entry = await this.calendarService.toggleWorn(
      id,
      this.userId(req),
      worn,
    );

    if (req.headers['hx-request'] === 'true') {
      return reply.viewPartial('partials/calendar_worn_button', {
        entryId: id,
        week: week ?? '',
        worn: entry.wornAt != null,
      });
    }

    return reply.redirect(dayUrl(week), 303);
  }
}
