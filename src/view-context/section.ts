/** The first path segment, which picks the current nav item: `/wardrobe/new` is `wardrobe`, `/` is ''. */
export function sectionOf(url: string): string {
  return url.split(/[?#]/)[0].split('/')[1] ?? '';
}
