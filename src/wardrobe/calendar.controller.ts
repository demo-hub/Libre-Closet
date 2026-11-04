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
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { Payload } from '../auth/dto/payload.dto';
import { CalendarService } from './calendar.service';
import { parseDateInput } from './date-input';
import { viewerTimeZone } from '../time-zone';

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
  constructor(
    private readonly calendarService: CalendarService,
    private readonly configService: ConfigService,
  ) {}

  private userId(req: FastifyRequest): number | undefined {
    return (req['user'] as Payload | undefined)?.userId;
  }

  private timeZone(req: FastifyRequest): string {
    return viewerTimeZone(req.cookies?.tz, this.configService.get('TZ'));
  }

  @Get()
  @Render('calendar/index')
  async index(
    @Query('week') weekParam: string | undefined,
    @Query('calMonth') calMonthParam: string | undefined,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // Back must not show a copy from before an entry was removed.
    reply.header('Cache-Control', 'no-store');
    const viewModel = await this.calendarService.buildIndexViewModel(
      weekParam,
      calMonthParam,
      this.userId(req),
      i18n,
      this.timeZone(req),
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
    const date = parseDateInput(body.date, 'date');
    if (!date) throw new BadRequestException('date is required');
    await this.calendarService.create(
      {
        date,
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
    @I18n() i18n: I18nContext,
  ) {
    const date = await this.calendarService.remove(id, this.userId(req));
    if (req.headers['hx-request'] === 'true') {
      const day = await this.calendarService.buildDayViewModel(
        date,
        this.userId(req),
        i18n,
        this.timeZone(req),
      );
      reply.header('HX-Trigger', 'calendarEntryRemoved');
      return reply.viewPartial('partials/calendar_day', {
        ...day,
        focus: true,
      });
    }
    return reply.redirect(dayUrl(validWeek(body?.week)), 303);
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
      reply.header(
        'HX-Trigger',
        JSON.stringify({ calendarWorn: { worn: entry.wornAt != null } }),
      );
      return reply.status(204).send();
    }

    return reply.redirect(dayUrl(week), 303);
  }
}
