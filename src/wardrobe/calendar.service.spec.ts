import type { I18nContext } from 'nestjs-i18n';
import { CalendarService } from './calendar.service';

type Garment = { id: number; photo: { fileName: string } | null };

const outfit = (
  id: number,
  name: string,
  garments: Garment[],
  slotOrder: number[] = [],
) => ({
  id,
  name,
  slots: slotOrder.map((garmentId) => ({ category: 'tops', garmentId })),
  garments: { getItems: () => garments },
});

const entry = (
  id: number,
  date: string,
  of: ReturnType<typeof outfit>,
  wornAt?: Date,
) => ({
  id,
  date: new Date(`${date}T00:00:00Z`),
  wornAt,
  outfit: { unwrap: () => of },
});

const i18n = (lang = 'en') =>
  ({
    lang,
    t: (key: string) => key.replace('lang.', ''),
  }) as unknown as I18nContext;

describe('CalendarService', () => {
  let entries: ReturnType<typeof entry>[];
  let calendarRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    getEntityManager: () => { flush: jest.Mock };
  };
  let flush: jest.Mock;
  let service: CalendarService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-03-04T12:00:00Z') });
    entries = [];
    flush = jest.fn().mockResolvedValue(undefined);
    calendarRepository = {
      find: jest.fn(() => Promise.resolve(entries)),
      findOne: jest.fn(),
      getEntityManager: () => ({ flush }),
    };
    service = new CalendarService(
      calendarRepository as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('the week view', () => {
    it('names each chip and shows its garments in slot order, three at most', async () => {
      const photo = (id: number): Garment => ({
        id,
        photo: { fileName: `g${id}.png` },
      });
      entries = [
        entry(
          1,
          '2026-03-02',
          outfit(
            4,
            'Office',
            [photo(1), photo(2), { id: 3, photo: null }, photo(4), photo(5)],
            [3, 5, 1],
          ),
          new Date(),
        ),
        entry(2, '2026-03-02', outfit(5, '', [])),
      ];

      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.days[1].entries).toEqual([
        {
          id: 1,
          worn: true,
          outfit: {
            id: 4,
            name: 'Office',
            thumbnails: [null, 'g5.png', 'g1.png'],
            moreGarments: 2,
          },
        },
        {
          id: 2,
          worn: false,
          outfit: { id: 5, name: null, thumbnails: [], moreGarments: 0 },
        },
      ]);
      expect(calendarRepository.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orderBy: { id: 'ASC' } }),
      );
    });

    it('carries no hue, week label or outfit list', async () => {
      entries = [entry(1, '2026-03-02', outfit(4, 'Office', []))];

      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm).not.toHaveProperty('weekLabel');
      expect(vm).not.toHaveProperty('outfits');
      expect(vm.days[1].entries[0].outfit).not.toHaveProperty('chipHue');
    });

    it('marks today by date, not by colour alone', async () => {
      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.days.map((day) => day.isToday)).toEqual([
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ]);
      expect(vm.days[3]).toMatchObject({
        dayName: 'CALENDAR_DAY_WED',
        dayNum: 4,
        dateParam: '2026-03-04',
      });
    });

    it.each([
      '',
      'garbage',
      '1',
      '2026-13-01',
      '2026-02-30',
      '275760-09-13',
      '0050-06-15',
    ])('shows the current week for the week param %p', async (week: string) => {
      const vm = await service.buildIndexViewModel(
        week,
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.days[0].dateParam).toBe('2026-03-01');
    });

    it('lays out seven days in the week the clocks change', async () => {
      // jest.global-setup.js runs the tests in Europe/Lisbon, whose clocks go forward on 29 March 2026.
      expect(new Date('2026-03-29T12:00:00Z').getTimezoneOffset()).not.toBe(
        new Date('2026-03-28T12:00:00Z').getTimezoneOffset(),
      );
      entries = [entry(1, '2026-04-04', outfit(4, 'Saturday', []))];

      const vm = await service.buildIndexViewModel(
        '2026-03-29',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.days.map((day) => day.dateParam)).toEqual([
        '2026-03-29',
        '2026-03-30',
        '2026-03-31',
        '2026-04-01',
        '2026-04-02',
        '2026-04-03',
        '2026-04-04',
      ]);
      expect(vm.days[6].entries.map((e) => e.id)).toEqual([1]);
      expect(calendarRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          date: {
            $gte: new Date('2026-03-29T00:00:00Z'),
            $lt: new Date('2026-04-05T00:00:00Z'),
          },
        }),
        expect.anything(),
      );
    });
  });

  describe('the mini-month', () => {
    it('marks today, the shown week and the days outside the month', async () => {
      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        undefined,
        undefined,
        i18n(),
      );
      const cells = vm.calendarWeeks.flatMap((week) => week.days);
      const classOf = (date: string) =>
        cells.find((cell) => cell.dateParam === date)?.calCellClass;

      expect(classOf('2026-03-04')).toBe('cal-today');
      expect(classOf('2026-03-01')).toBe('cal-in-week');
      expect(classOf('2026-03-07')).toBe('cal-in-week');
      expect(classOf('2026-03-08')).toBe('');
      expect(classOf('2026-04-04')).toBe('cal-out-month');
      expect(cells.filter((cell) => cell.isToday)).toHaveLength(1);
    });

    it('names each day in full and links it to its own week', async () => {
      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.calendarWeeks[0].days[3]).toMatchObject({
        dayNum: 4,
        dateParam: '2026-03-04',
        label: 'Wednesday 4 March',
      });
      expect(vm.weekdays[0]).toEqual({
        name: 'CALENDAR_DAY_SUN',
        letter: 'CALENDAR_CAL_SUN_LETTER',
      });
    });

    it.each([
      ['en', 'March 2026'],
      ['de', 'März 2026'],
      ['es', 'Marzo de 2026'],
      ['fr', 'Mars 2026'],
      ['it', 'Marzo 2026'],
      ['ru', 'Март 2026 г.'],
    ])('reads the month in %s as %p', async (lang: string, label: string) => {
      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        undefined,
        undefined,
        i18n(lang),
      );

      expect(vm.monthLabel).toBe(label);
    });

    it('shows the month of the day asked for, not of the Sunday before it', async () => {
      const vm = await service.buildIndexViewModel(
        '2026-04-02',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.monthLabel).toBe('April 2026');
      expect(vm.days[0].dateParam).toBe('2026-03-29');
      expect(vm.monthOpen).toBe(false);
    });

    it('opens on a month asked for by calMonth, and moves by month from it', async () => {
      const vm = await service.buildIndexViewModel(
        '2026-03-01',
        '2026-05',
        undefined,
        i18n(),
      );

      expect(vm.monthLabel).toBe('May 2026');
      expect(vm.monthOpen).toBe(true);
      expect(vm).toMatchObject({
        prevMonthParam: '2026-04',
        prevMonthWeekParam: '2026-04-01',
        nextMonthParam: '2026-06',
        nextMonthWeekParam: '2026-06-01',
      });
    });

    it("moves into the current month at today's week", async () => {
      const vm = await service.buildIndexViewModel(
        '2026-04-12',
        undefined,
        undefined,
        i18n(),
      );

      expect(vm.prevMonthWeekParam).toBe('2026-03-04');
    });

    it.each(['2026-13', '2026-00', '2026-7', '0000-01'])(
      'ignores the month %p',
      async (calMonth: string) => {
        const vm = await service.buildIndexViewModel(
          '2026-03-01',
          calMonth,
          undefined,
          i18n(),
        );

        expect(vm.monthLabel).toBe('March 2026');
        expect(vm.monthOpen).toBe(false);
      },
    );
  });

  describe('marking an entry worn', () => {
    const stored = (wornAt?: Date) => {
      const found = { id: 1, owner: null, wornAt };
      calendarRepository.findOne.mockResolvedValue(found);
      return found;
    };

    it('keeps the first wear when asked to mark it worn again', async () => {
      const first = new Date('2026-03-02T09:00:00Z');
      const found = stored(first);

      await service.toggleWorn(1, undefined, true);

      expect(found.wornAt).toBe(first);
    });

    it('clears it when asked to unmark it, however often', async () => {
      const found = stored(new Date());

      await service.toggleWorn(1, undefined, false);
      await service.toggleWorn(1, undefined, false);

      expect(found.wornAt).toBeUndefined();
    });

    it('flips it when the request names no state', async () => {
      const found = stored(undefined);

      await service.toggleWorn(1);

      expect(found.wornAt).toEqual(new Date('2026-03-04T12:00:00Z'));
      expect(flush).toHaveBeenCalled();
    });
  });
});
