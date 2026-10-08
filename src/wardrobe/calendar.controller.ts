import {
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
    return this.calendarService.buildIndexViewModel(
      weekParam,
      calMonthParam,
      this.userId(req),
      i18n,
    );
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
    return reply.redirect(`/calendar?week=${body.week ?? body.date}`, 302);
  }

  @Post(':id/delete')
  @HttpCode(200)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { week?: string },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.calendarService.remove(id, this.userId(req));
    const location = `/calendar?week=${body.week ?? ''}`;
    if (req.headers['hx-request'] === 'true') {
      reply.header('HX-Redirect', location);
      return reply.send();
    }
    return reply.redirect(location, 303);
  }

  @Post(':id/worn')
  async toggleWorn(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { week?: string; worn?: string },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const entry = await this.calendarService.toggleWorn(
      id,
      this.userId(req),
      body.worn === 'true' ? true : body.worn === 'false' ? false : undefined,
    );
    const week = body.week ?? '';

    if (req.headers['hx-request'] === 'true') {
      return reply.viewPartial('partials/calendar_worn_button', {
        entryId: id,
        week,
        worn: entry.wornAt != null,
      });
    }

    return reply.redirect(`/calendar?week=${week}`, 303);
  }
}
