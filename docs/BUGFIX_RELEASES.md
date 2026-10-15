# Bug-fix releases after 1.0.0

Status: accepted 2026-10-15; 1.1.0 in review. Plans the minor releases that clear [BUGS.md](BUGS.md).

BUGS.md held 55 entries on 2026-10-15. The high and medium entries were checked against `main` at `e6dae60`. The low entries are as BUGS.md records them. No open PR or unmerged branch fixes any of them. This plan puts 51 of them into seven minor releases, 1.1.0 to 1.7.0, in order of severity. It leaves four out (section 9). Two security defaults found while planning were never in BUGS.md; 1.1-e fixes them. Each PR re-checks its entries before starting.

---

## 1. Rules

- **One PR per row below.** It removes the BUGS.md entries it fixes, as BUGS.md asks, and adds a test that fails before the fix where one can.
- **Fixes that touch the same file share a PR.** That keeps two PRs from editing the same lines in one release.
- **Each release ends with a `chore/release-x.y.z` PR.** It bumps `package.json` and `package-lock.json` and adds a Keep a Changelog entry in plain British English, as 1.0.0 did. The branch is `chore/`, not `release/`, because merging a `release/` branch runs `tag-release.yml`. The tag is pushed once the PR is merged.
- **New strings go into all six locales.** Machine-written values join the native-speaker list in BUGS.md (section 9).
- **Order:** releases ship in the order below. PRs within a release are independent unless a row says otherwise.

---

## 2. 1.1.0: accounts and security

All three high-severity account bugs are here. Almost every change is in `src/auth/`.

Upgrade notes for the changelog: outstanding reset codes stop working (1.1-a); instances that ran on the default secret sign everyone out once, and push subscriptions made with the shared keys stop working (1.1-e).

| PR | Fixes | Change |
| --- | --- | --- |
| 1.1-a `fix/reset-code-lifetime`, #44 (merged) | Reset codes never expire and are never cleared (high). The reset form tells whether an address has an account (medium). | Add `createdAt` to `PasswordReset`. This is a migration: the SQLite file, the Postgres file, both snapshots, and the entity. The migration unlinks every user from its code, then deletes the codes. They never expired, and stamping them with `now()` would keep them valid. Unlinking comes first because `user.password_reset_id` is `on delete cascade`: deleting a linked code deletes its user (see BUGS.md). `resetPassword` refuses a code older than the lifetime (**D1**) and deletes the row once it is used. `postReset` goes on to the code page for every address, and sends the email only when the account exists. |
| 1.1-b `fix/delete-account-identity`, #46 | Delete account accepts anyone's credentials (high). | Check the typed password against the signed-in user's own account (`payload.userId`). Ignore any typed email. The form keeps one password field. |
| 1.1-c `fix/auth-live-validation`, #49 | Live validation echoes typed passwords into the HTML (medium). Password rules are reported before a password is typed (low). A rate-limited submit shows the generic error toast (low). | No password is rendered back into the page; the head script already restores typed values across a live-validation swap. Live validation reports only fields that hold something (the change event fires on the shared wrapper, so `HX-Trigger-Name` names no field). A 429 shows its own toast with the existing `ERROR_429` text instead of the generic one. |
| 1.1-d `fix/register-without-accounts`, #47 | With AUTH_ENABLED=false, registering lands on a 404 (low). | **Changed while building it:** register and login land on `/wardrobe` when accounts are off, not on `/auth/profile`. A 404 for the routes would drop the register page's coverage, since the browser-test server runs without accounts. What's left is a new BUGS.md entry. |
| 1.1-e `fix/default-secrets`, #48 | `ACCESS_TOKEN_SECRET` defaults to `ChangeMe!`, so anyone can sign a token for any `userId`. The guards' password fingerprint stops a sign-in, but the view context checked the signature alone, so every page's header showed that user's email address (medium). The VAPID key pair is a shared default too, shipped in the image's `.env` (medium). Neither was in BUGS.md; this PR fixes both, so there is nothing to add. | Done as planned. The config schema resolves all three after its defaults, so `DATA_PATH` is known. An environment value wins. Otherwise they come from `DATA_PATH/instance-secrets.json`, created on first boot (mode 600, never overwritten). `ChangeMe!`, the shared pair, a lone key and `''` count as unset. If the file can't be written, they are kept in memory for that run, with a warning. The view context also checks the password fingerprint now, as the guards do. Must ship before 1.2-b. |

---

## 3. 1.2.0: self-hosting and sharing

The two remaining high-severity bugs. Both hit an instance started from the README's quick start.

| PR | Fixes | Change |
| --- | --- | --- |
| 1.2-a `fix/site-url-default`, #53 | Share links point at the upstream instance unless `SITE_URL` is set (high). Default share images drop the port (low). A blank OPERATOR_NAME shows an empty "Run by" (low). | Done as planned, with `||` and `req.protocol` + `req.host` in one helper (`src/public-url.ts`). **Changed while building it:** web-push throws at boot on a VAPID subject that is not `https:` or `mailto:`, and `SITE_URL` was that subject, so an unset one would have stopped the app. The subject now falls back to `mailto:` `OPERATOR_CONTACT`, then `SOURCE_URL`, which also lets `SITE_URL` be `http://`. The view context and the sitemap read `X-Forwarded-*` themselves, from any client; they now take Fastify's values, which honour `trustProxy`. The sitemap, `/share` (its canonical and preview image) and invite links use the same helper. The config schema moved to `src/config.schema.ts` so it can be tested. |
| 1.2-b `fix/push-subscription` | Push notifications cannot be subscribed from the UI (high). After a service-worker update, a search loses its terms (low). | The layout gets a server-rendered `isAuthenticated` flag instead of reading the `httpOnly` cookie. Push has been dead since it shipped, so test the whole path: subscribe, send, the notification click, and unsubscribe on sign-out. The update handler reloads `detail.pathInfo.finalRequestPath`, so the query is kept. Both are in the head script of `views/layout.hbs`. |
| 1.2-c `fix/copy-without-clipboard`, #56 | Copy buttons do nothing on an instance served over plain http (medium). | Done as planned: one helper, `public/js/copy.js`, bound once from the layout, replaces the five views' own copy code. It uses `navigator.clipboard` in a secure context. Otherwise it puts the text in a read-only field after the button and selects it. **Changed while building it:** it then tries `document.execCommand('copy')`, which still copies over plain http in current browsers. Only where that fails does the field stay, with "Press Ctrl+C to copy" (⌘C on a Mac, and "Select the text above and copy it" on a touch screen). The invite links on the sharing page already show their link, so the helper selects that field rather than adding another. The landing page's button stays outside `.below-fold` (#51), and is now shown wherever JavaScript runs, not only where there is a clipboard. |
| 1.2-d `fix/page-titles` | Most pages are titled with the bare app name (medium). | Set `pageTitle` in `file.controller.ts`, `wardrobe-share.controller.ts`, `auth.controller.ts`, `open-graph.controller.ts` and `/chat`. Reuse each page's heading key where one exists. |

---

## 4. 1.3.0: wardrobe and outfit data

These bugs lose or corrupt data, or answer 500.

| PR | Fixes | Change |
| --- | --- | --- |
| 1.3-a `fix/garment-search` | The colour filter misses garments with several colours (medium). `%` and `_` in a search act as wildcards (low). | Colour matches a whole token in the comma-joined value. Use `color = x`, or `$like` on `x,%`, `%,x` or `%,x,%`, so `red` does not match `darkred`. Writes join on a bare `,` (`wardrobe.controller.ts:202, 383, 427`). Escape `%`, `_` and `\` in the keyword and pass `ESCAPE '\'`. This needs a query builder or raw fragment, because MikroORM's `$like` has no escape option. Test on SQLite and Postgres. Depends on 1.3-b, which makes stored values match these patterns. |
| 1.3-b `fix/colour-validation` | Colours are stored as typed (low). | Use a DTO transform. Split on commas and trim. Lower-case enum names. Drop duplicates, markup and empty items. Cap each item's length. Join the result again. Run it on create, edit and import. Add a data migration that normalises existing `color` values the same way, so older rows with spaces, capitals or duplicates match 1.3-a's filter. |
| 1.3-c `fix/date-validation` | An unreadable date answers 500 (low), along with the duplicate outfit it creates. | `@IsDateString()` (or a transform with a field error) on `dateAquired`, `scheduleDate` and calendar `date`. Validate in the outfit controller before anything is saved, so a failed date saves nothing. |
| 1.3-d `fix/outfit-editor-data` | An outfit loses a garment once that garment is archived (medium). Every save of an outfit with a date adds another calendar entry (low). Categories typed in the outfit builder are case-sensitive, and its suggestions are not translated (low). | `buildCategoryRows` adds the outfit's own garments even when they are archived, marked "Archived", and keeps their row. Save adds a calendar entry only when that outfit has none on that date. Typed categories are lower-cased and matched to `GarmentCategory`, and the suggestions show translated names with the stored value. Depends on 1.3-c, since both edit `outfit.controller.ts` `create` and `update`. |

---

## 5. 1.4.0: garment page and photo editor

Mostly `public/js/background-removal.js` and `views/partials/photoPicker.hbs`.

| PR | Fixes | Change |
| --- | --- | --- |
| 1.4-a `fix/mask-editor-save` | A failed save of an edited cut-out looks saved (medium). The restore brush paints the wrong pixels on a non-square photo with no stored cut-out (medium). Background removal logs to the console in production (low). | Check `response.ok`. On failure, keep the old image and show a translated in-page error. `#requestErrorToast` answers htmx requests only, so the page needs a small error region for scripts. Pad the restore source the way `/file/nobg/` pads its fallback, or have the editor pad both the same way. Set `debug: false` and remove the `console.log` calls. |
| 1.4-b `fix/photo-picker-storage` | With site data blocked, a garment's photo cannot be replaced (low). After Back, the new-garment form shows a photo it no longer has (low). | Wrap `localStorage` reads in try/catch, in `photoPicker.hbs` and in `isBgRemovalEnabled`. Clear `#photoPreview` in the `htmx:beforeHistorySave` handler in `layout.hbs`. |
| 1.4-c `fix/garment-card-title` | A garment without a name has an empty card title on the wardrobe grid (low). | Fall back to the translated category, as the garment page does. |

---

## 6. 1.5.0: calendar

Every calendar entry. `calendar.service.ts` changes a lot here.

| PR | Fixes | Change |
| --- | --- | --- |
| 1.5-a `fix/calendar-today` | "Today" is the server's date in UTC (medium). | Work out today in the viewer's time zone (**D2**, decided). The head script sets a `tz` cookie from `Intl.DateTimeFormat().resolvedOptions().timeZone`. The server validates it as an IANA zone and falls back to a new `TZ` setting, then UTC. Thread it through `findWeekBounds` and `parseWeekParam`. |
| 1.5-b `fix/calendar-week-start` | The week starts on Sunday in every language (low). | Start every week on Monday (**D3**). Update `startOfWeek`, `buildCalendarWeeks` and the weekday headings. Depends on 1.5-a, since both edit the same functions. |
| 1.5-c `fix/calendar-history` | Back can bring a removed entry back (medium). Removing an entry reloads the whole page (low). The worn toggle may move the VoiceOver cursor on iOS (low, unconfirmed). | Send `Cache-Control: no-store` on `/calendar`. Remove an entry with an htmx swap of its day, not `HX-Redirect`, and move focus to the day's heading. The worn toggle keeps its button and changes only `aria-pressed` and the icon. That is the fix BUGS.md suggests, and it is cheap even unconfirmed. Close the VoiceOver entry once someone checks it on a device. |
| 1.5-d `feat/calendar-week-nav` | There is no previous week, next week or today control, and nothing names the week shown (low). Up to 42 links stand between the keyboard and the week (medium). | Add Previous week, Next week and Today. The page title and heading name the week ("Week of 12 October"). A live region announces a change of week. The month becomes a WAI-ARIA grid with one tab stop, moved by the arrow keys, and the shown week is marked with `aria-current` as well as the ring. The arrow-key script degrades to plain links without JS. |

---

## 7. 1.6.0: wardrobe and outfit UI

Low-severity behaviour on the wardrobe and outfit pages.

| PR | Fixes | Change |
| --- | --- | --- |
| 1.6-a `fix/wardrobe-filters-ui` | One facet cannot be cleared inside the filter sheet (low). Apply and Clear produce URLs full of empty parameters (low). A wardrobe whose garments are all archived says "No garments yet" (low). The result count has no plural (low). | Make a chosen chip clearable a second time, or add an "Any" chip to each facet. Disable empty inputs on `submit` so they are not sent. The all-archived empty state names the archived count and links to Show archived. Pluralise the count with nestjs-i18n's plural support. The app uses none yet, so confirm its key format first. ru needs one, few, many and other. |
| 1.6-b `fix/garment-categories` | Four category names are translated but never used (low). | Add `ACTIVEWEAR`, `SWIMWEAR`, `UNDERWEAR` and `LINGERIE` to `GarmentCategory` (**D4**). `category` is a string column, so this needs no migration. |
| 1.6-c `fix/outfit-builder-a11y` | Cycling a garment or adding a row in the outfit builder is silent to screen readers (low). Fast presses on an outfit row's Next are partly lost (low). | Announce the new garment or row in `#outfit-rows-status`. Name Previous and Next with the category ("Next top"). Queue presses (`hx-sync="this:queue last"`), or send a step count, so every press counts. |

---

## 8. 1.7.0: accessibility, theme and translations

CSS and locale files. No server logic.

| PR | Fixes | Change |
| --- | --- | --- |
| 1.7-a `fix/theme-a11y` | Placeholder text fails contrast (medium). A focused control's ring is partly hidden under the header or the dock (low). Firefox leaves a focused control partly under the dock (low). With WCAG 1.4.12 text spacing, a button label that wraps spills out of its button (low). | Placeholders use Graphite, as plan 5.1 says. Add 0.5rem to both `scroll-padding` values. `.btn` gets `h-auto min-h-(--size)`. Firefox needs a `focusin` handler that calls `scrollIntoView({ block: 'nearest' })` when a control sits under a bar. If that is not worth the script, close the entry as a known Firefox limitation, since WCAG 2.4.11 passes. Run the visual snapshots. |
| 1.7-b `fix/colour-names` | Colour names are never translated (low). | Add `COLOR_*` keys. `formatColors`, the filter chips, the AI chips and the multiselect translate enum colours and show custom colours as they are. |
| 1.7-c `fix/locale-copy` | "Archived" has the wrong gender for a garment in es and ru (low). French filter pills put no space before the colon (low). German uses two words for the wardrobe (low). "AGPL-3.0" can break across lines at its hyphen (low). Four languages drop part of the landing page's opening paragraph (low). | Fix the es and ru gender. Move the pill's separator into a translated key, so fr gets `" : "`. Use one German word for the wardrobe and one for the calendar, in de and it. Wrap "AGPL-3.0" in `<span class="whitespace-nowrap">` where it is rendered, rather than U+2011, which the Inter subsets do not draw. Complete `HERO_DESCRIPTION` and `FEATURE_SCHEDULING_DESC`. |

---

## 9. Not in a release

| Entry | Why | Next step |
| --- | --- | --- |
| Machine-written values await a native speaker | Needs a person, not a PR. | Recruit reviewers per language. Each review is a PR that removes that language from the list. 1.7-c should go first, so the reviewers see the final copy. |
| Chrome logs "Transition was skipped" when Back follows a boosted navigation | htmx behaviour, and only a console message. | Check whether the htmx version in use still logs it. If it does, close the entry as won't-fix. |
| A local Playwright run writes into whatever app answers on :3000 | Tooling, not user-facing. | A `chore/` PR at any time. Run the e2e server on its own port (for example 3100) with `reuseExistingServer: false`. |
| Bare `npx tsc` reports about 96 errors | Tooling, not user-facing. | A `chore/` PR at any time. Fix `tsconfig.json` so bare `tsc` matches the Nest build, or add a `typecheck` script and say to use it. |

---

## 10. Decisions

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | How long does a reset code last? | 15 minutes, and only the newest code works. Optionally, lock after 5 wrong tries, since a six-digit code is guessable within the throttle over hours. |
| D2 | Whose time zone is "today"? | **Decided 2026-10-15:** the browser's. The head script sets a `tz` cookie from `Intl.DateTimeFormat().resolvedOptions().timeZone`, and the server uses it, falling back to a `TZ` setting and then UTC. A single-user instance could set `TZ` alone, but a shared instance spans zones. |
| D3 | Monday for everyone, or the locale's first day? | Monday for everyone. All six languages start on Monday. Revisit if a Sunday-first locale (en-US) is added. |
| D4 | Add the four categories, or drop their keys? | Add them. The keys are translated already, and imports can map to them. |
| D5 | Version numbers | Seven minor releases, 1.1.0 to 1.7.0, as asked. A release can be cut early, and 1.1.0 and 1.2.0 should not wait for the others. |
