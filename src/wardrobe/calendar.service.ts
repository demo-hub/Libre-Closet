import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OutfitCalendar } from '../dal/entity/outfit-calendar.entity';
import { Outfit } from '../dal/entity/outfit.entity';
import { User } from '../dal/entity/user.entity';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { CalendarDay } from './view-models/calendar-day.view-model';
import { WeekSchedule } from './view-models/week-schedule.view-model';
import { I18nContext } from 'nestjs-i18n';
import { WeekNavBoundaries } from './view-models/week-nav-boundaries';
import { intlLocale } from '../i18n/intl-locale';
import { garmentsInSlotOrder } from './outfit-order';

/** How many garments a calendar chip shows before "+N". */
const CHIP_THUMBNAILS = 3;

interface MiniMonthDay {
  dayNum: number;
  dateParam: string;
  label: string;
  isToday: boolean;
  calCellClass: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  /** i18n key suffixes for each day of the week (index 0 = Sunday). */
  private readonly DAY_I18N_KEYS = [
    'CALENDAR_DAY_SUN',
    'CALENDAR_DAY_MON',
    'CALENDAR_DAY_TUE',
    'CALENDAR_DAY_WED',
    'CALENDAR_DAY_THU',
    'CALENDAR_DAY_FRI',
    'CALENDAR_DAY_SAT',
  ] as const;

  /** The mini-month's column headings, in the same order. */
  private readonly DAY_LETTER_I18N_KEYS = [
    'CALENDAR_CAL_SUN_LETTER',
    'CALENDAR_CAL_MON_LETTER',
    'CALENDAR_CAL_TUE_LETTER',
    'CALENDAR_CAL_WED_LETTER',
    'CALENDAR_CAL_THU_LETTER',
    'CALENDAR_CAL_FRI_LETTER',
    'CALENDAR_CAL_SAT_LETTER',
  ] as const;

  constructor(
    @InjectRepository(OutfitCalendar)
    private readonly calendarRepository: EntityRepository<OutfitCalendar>,
    @InjectRepository(Outfit)
    private readonly outfitRepository: EntityRepository<Outfit>,
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
  ) {}

  /** The seven days from the Sunday on or before `anchorDate`, each with its entries in the order they were added. */
  async findWeek(anchorDate: Date, userId?: number): Promise<WeekSchedule> {
    const weekStart = startOfWeek(anchorDate);
    const weekEnd = addDays(weekStart, 7);

    const ownerFilter =
      userId != null ? { owner: { id: userId } } : { owner: null };

    const entries = await this.calendarRepository.find(
      { ...ownerFilter, date: { $gte: weekStart, $lt: weekEnd } },
      {
        populate: ['outfit', 'outfit.garments', 'outfit.garments.photo'],
        orderBy: { id: 'ASC' },
      },
    );

    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => ({
      date: addDays(weekStart, i),
      entries: [],
    }));

    for (const entry of entries) {
      const dayIndex = daysBetween(weekStart, entry.date);
      if (dayIndex < 0 || dayIndex > 6) continue;

      days[dayIndex].entries.push(entry);
    }

    return { weekStart, days };
  }

  async create(
    dto: CreateCalendarEntryDto,
    userId?: number,
  ): Promise<OutfitCalendar> {
    const outfit = await this.outfitRepository.findOne(
      userId != null
        ? { id: dto.outfitId, owner: { id: userId } }
        : { id: dto.outfitId, owner: null },
    );
    if (!outfit) throw new NotFoundException('Outfit not found');

    const entry = this.calendarRepository.create({
      date: dto.date,
      outfit,
      notes: dto.notes,
    });

    if (userId != null) {
      const user = await this.userRepository.findOneOrFail(userId);
      entry.owner = user as any;
    }

    await this.calendarRepository.getEntityManager().persistAndFlush(entry);
    this.logger.log(
      `Calendar entry created: outfitId=${dto.outfitId} date=${dto.date.toISOString()} userId=${userId}`,
    );
    return entry;
  }

  async remove(id: number, userId?: number): Promise<void> {
    const entry = await this.findOneOwned(id, userId);
    await this.calendarRepository.getEntityManager().removeAndFlush(entry);
  }

  /** Sets wornAt to now or clears it; with no `worn` given, flips it. */
  async toggleWorn(
    id: number,
    userId?: number,
    worn?: boolean,
  ): Promise<OutfitCalendar> {
    const entry = await this.findOneOwned(id, userId);
    const wornNow = entry.wornAt != null;
    const target = worn ?? !wornNow;
    if (target !== wornNow) entry.wornAt = target ? new Date() : undefined;
    await this.calendarRepository.getEntityManager().flush();
    return entry;
  }

  /**
   * Assembles the full view-model for the calendar index page.
   * Encapsulates all date math, month-navigation, and entry transformation
   * so the controller only handles the HTTP layer.
   */
  async buildIndexViewModel(
    weekParam: string | undefined,
    calMonthParam: string | undefined,
    userId: number | undefined,
    i18n: I18nContext,
  ) {
    const anchor = this.parseWeekParam(weekParam);
    const weekSchedule = await this.findWeek(anchor, userId);
    const weekBounds = this.findWeekBounds(weekSchedule);
    const shownMonth = parseMonthParam(calMonthParam);

    return {
      pageTitle: i18n.t('lang.CALENDAR_PAGE_TITLE'),
      days: this.calDays(weekSchedule, i18n, weekBounds),
      monthOpen: shownMonth != null,
      ...this.getMiniMonthCal(
        weekBounds,
        shownMonth ?? {
          year: anchor.getUTCFullYear(),
          month: anchor.getUTCMonth(),
        },
        i18n,
      ),
    };
  }
  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  /** Parses a YYYY-MM-DD query param into a UTC date, defaulting to today. */
  private parseWeekParam(param: string | undefined): Date {
    if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return new Date();
    const d = new Date(`${param}T00:00:00Z`);
    return !isNaN(d.getTime()) && this.toWeekParam(d) === param
      ? d
      : new Date();
  }

  /** Formats a Date as YYYY-MM-DD for use in query params and hidden inputs. */
  private toWeekParam(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Returns the CSS class for a single calendar date cell. */
  private calCellClass(
    dateStr: string,
    todayStr: string,
    weekStartStr: string,
    weekEndStr: string,
    inMonth: boolean,
  ): string {
    if (dateStr === todayStr) return 'cal-today';
    if (dateStr >= weekStartStr && dateStr <= weekEndStr) return 'cal-in-week';
    if (!inMonth) return 'cal-out-month';
    return '';
  }

  /** Builds the mini-calendar grid rows for the given month. */
  private buildCalendarWeeks(
    calYear: number,
    calMonth: number,
    weekBounds: WeekNavBoundaries,
    locale: string,
  ) {
    const cellLabel = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    const gridCursor = startOfWeek(new Date(Date.UTC(calYear, calMonth, 1)));
    const weeks: { days: MiniMonthDay[] }[] = [];
    for (let w = 0; w < 6; w++) {
      const days: MiniMonthDay[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(gridCursor);
        const dateStr = this.toWeekParam(date);
        days.push({
          dayNum: date.getUTCDate(),
          dateParam: dateStr,
          label: cellLabel.format(date),
          isToday: dateStr === weekBounds.todayStr,
          calCellClass: this.calCellClass(
            dateStr,
            weekBounds.todayStr,
            weekBounds.weekStartStr,
            weekBounds.weekEndStr,
            date.getUTCMonth() === calMonth,
          ),
        });
        gridCursor.setUTCDate(gridCursor.getUTCDate() + 1);
      }
      weeks.push({ days });
      if (gridCursor.getUTCMonth() !== calMonth && gridCursor.getUTCDay() === 0)
        break;
    }
    return weeks;
  }

  /** Builds the day columns for the week view. */
  private calDays(
    weekSchedule: WeekSchedule,
    i18n: I18nContext,
    weekBounds: WeekNavBoundaries,
  ) {
    return weekSchedule.days.map((day) => {
      const dateParam = this.toWeekParam(day.date);
      return {
        dayName: i18n.t(`lang.${this.DAY_I18N_KEYS[day.date.getUTCDay()]}`),
        dayNum: day.date.getUTCDate(),
        dateParam,
        isToday: dateParam === weekBounds.todayStr,
        entries: day.entries.map((entry) => {
          const outfit = entry.outfit.unwrap();
          const garments = garmentsInSlotOrder(outfit);
          return {
            id: entry.id,
            worn: entry.wornAt != null,
            outfit: {
              id: outfit.id,
              name: outfit.name || null,
              thumbnails: garments
                .slice(0, CHIP_THUMBNAILS)
                .map((g) => g.photo?.fileName ?? null),
              moreGarments: Math.max(0, garments.length - CHIP_THUMBNAILS),
            },
          };
        }),
      };
    });
  }

  /** Builds the mini-month calendar for the given month. */
  private getMiniMonthCal(
    weekBounds: WeekNavBoundaries,
    shown: { year: number; month: number },
    i18n: I18nContext,
  ) {
    const locale = intlLocale(i18n.lang);
    const { year: calYear, month: calMonth } = shown;
    const prevMonthDate = new Date(Date.UTC(calYear, calMonth - 1, 1));
    const nextMonthDate = new Date(Date.UTC(calYear, calMonth + 1, 1));
    const monthWeekParam = (first: Date) =>
      this.toWeekParam(first).slice(0, 7) === weekBounds.todayStr.slice(0, 7)
        ? weekBounds.todayStr
        : this.toWeekParam(first);
    const monthLabel = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(calYear, calMonth, 1)));

    return {
      // Intl writes month names in lower case in es, fr, it and ru; this one starts a line.
      monthLabel:
        monthLabel.charAt(0).toLocaleUpperCase(locale) + monthLabel.slice(1),
      weekdays: this.DAY_I18N_KEYS.map((key, i) => ({
        name: i18n.t(`lang.${key}`),
        letter: i18n.t(`lang.${this.DAY_LETTER_I18N_KEYS[i]}`),
      })),
      calendarWeeks: this.buildCalendarWeeks(
        calYear,
        calMonth,
        weekBounds,
        locale,
      ),
      prevMonthParam: this.toWeekParam(prevMonthDate).slice(0, 7),
      nextMonthParam: this.toWeekParam(nextMonthDate).slice(0, 7),
      prevMonthWeekParam: monthWeekParam(prevMonthDate),
      nextMonthWeekParam: monthWeekParam(nextMonthDate),
    };
  }

  private findWeekBounds(weekSchedule: WeekSchedule): WeekNavBoundaries {
    return {
      todayStr: this.toWeekParam(new Date()),
      weekStartStr: this.toWeekParam(weekSchedule.weekStart),
      weekEndStr: this.toWeekParam(addDays(weekSchedule.weekStart, 6)),
    };
  }

  private async findOneOwned(
    id: number,
    userId?: number,
  ): Promise<OutfitCalendar> {
    const entry = await this.calendarRepository.findOne(id, {
      populate: ['outfit'],
    });
    if (!entry) throw new NotFoundException('Calendar entry not found');

    if (userId != null) {
      if (entry.owner?.id !== userId) throw new ForbiddenException();
    } else {
      if (entry.owner != null) throw new ForbiddenException();
    }
    return entry;
  }
}

// ---------------------------------------------------------------------------
// Pure date helpers (no external deps)
// ---------------------------------------------------------------------------

/** Returns the Sunday of the week containing `d` at midnight UTC. */
function startOfWeek(d: Date): Date {
  const result = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
  return result;
}

/** `d` moved by whole UTC days, so a daylight-saving change in the server's zone cannot shift it. */
function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Number of whole days from `from` to `to` (positive when to > from). */
function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) -
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) /
      86_400_000,
  );
}

/** A YYYY-MM `calMonth` param as a year and zero-based month, or null. */
function parseMonthParam(
  param: string | undefined,
): { year: number; month: number } | null {
  const match = param ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
}
