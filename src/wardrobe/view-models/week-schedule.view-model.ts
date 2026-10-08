import { CalendarDay } from './calendar-day.view-model';

export interface WeekSchedule {
  /** The Sunday the week starts on, at midnight UTC. */
  weekStart: Date;
  /** Seven days, Sun–Sat, each with its calendar entries. */
  days: CalendarDay[];
}
