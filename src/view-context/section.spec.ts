import { sectionOf } from './section';

describe('sectionOf', () => {
  it.each([
    ['/', ''],
    ['', ''],
    ['/wardrobe', 'wardrobe'],
    ['/wardrobe/', 'wardrobe'],
    ['/wardrobe/new', 'wardrobe'],
    ['/wardrobe?ownerId=3', 'wardrobe'],
    ['/outfits/1/edit', 'outfits'],
    ['/calendar?week=2026-03-01', 'calendar'],
    ['/calendar#today', 'calendar'],
    ['/wardrobe-share/manage', 'wardrobe-share'],
  ])('%s is in section "%s"', (url: string, section: string) => {
    expect(sectionOf(url)).toBe(section);
  });
});
