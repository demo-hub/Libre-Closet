# Known bugs

Bugs found while working on this fork and left out of the change that found them, kept here so they can be planned and fixed together.

- A PR that finds a bug it does not fix adds an entry.
- A PR that fixes one removes its entry.

**Severity:**
- **high:** security, data loss, or a feature that does not work.
- **medium:** wrong behaviour that users will hit.
- **low:** cosmetic, rare, or tooling.

## Accounts and security

- **Reset codes never expire and are never cleared** (high).
  - Each reset request stores a new six-digit code (`sendPasswordResetEmail`).
  - `resetPassword` checks the code but not its age, and does not delete it after use.
  - Where: `src/auth/auth.service.ts`, `sendPasswordResetEmail` and `resetPassword`.
  - Found in #27.
- **Delete account accepts anyone's credentials** (high).
  - The confirmation signs in with whatever email and password are typed, then deletes the signed-in user. The credentials of any other account therefore pass the check.
  - Where: `src/auth/auth.controller.ts`, `postDeleteAccount`.
  - Found in #27.
- **The reset form tells whether an address has an account** (medium).
  - A known address goes on to the code page, while an unknown one gets `RESET_FAILED`.
  - Where: `src/auth/auth.controller.ts`, `postReset`.
  - Found in #27.
- **Live validation echoes typed passwords into the HTML** (medium).
  - The `validate/register` and `validate/reset-code` responses render the typed password and confirmation in the inputs' `value` attributes.
  - It goes back only to the same client, but whether htmx's history cache can then store it has not been checked.
  - Where: `views/auth/register.hbs:23-24` and `views/auth/reset-code.hbs:10-11` (`value=input.password`).
  - Found in #27.
- **A rate-limited submit shows the generic error toast** (low).
  - An htmx submit answered 429 shows the "request failed" toast, not an in-page message.
  - Found in #27.
- **Password rules are reported before a password is typed** (low).
  - Live validation checks every field on any change, so leaving the email field shows the password errors.
  - Found in #27.

## Wardrobe

- **The colour filter misses garments with several colours** (medium).
  - Colours are stored comma-joined, and the filter compares by equality, so a red-and-blue garment is not listed under red.
  - Where: `src/wardrobe/garment.service.ts:65`.
  - Found in #28.
- **`%` and `_` in a search act as wildcards** (low).
  - The keyword goes into SQL `LIKE` unescaped.
  - Where: `src/wardrobe/garment.service.ts`, `findAll`.
  - Found in #28.
- **The result count has no plural** (low).
  - It reads "1 results", and Russian uses one form for every count.
  - Where: `views/wardrobe/index.hbs:46`.
  - Found in #28.
- **Four category names are translated but never used** (low).
  - `CATEGORY_ACTIVEWEAR`, `_SWIMWEAR`, `_UNDERWEAR` and `_LINGERIE` exist in the locale files, but `GarmentCategory` has no such values, so a garment typed with one of those categories shows the raw word.
  - Found in #28.
- **One facet cannot be cleared inside the filter sheet** (low).
  - The chips are radios. Only the pill or "Clear filters" removes a facet.
  - Found in #28.
- **Apply and Clear produce URLs full of empty parameters** (low).
  - For example `?category=&color=&size=&archived=&keyword=`. The hidden inputs are always submitted.
  - Found in #28.
- **A wardrobe whose garments are all archived says "No garments yet"** (low).
  - Found in #28.
- **An unreadable date answers 500** (low).
  - Nothing validates the garment's `dateAquired`, an outfit's `scheduleDate` or a calendar entry's `date`, so a POST with `garbage` in any of them reaches `new Date(...)` and fails in the database layer instead of reporting a field error.
  - An outfit is saved before its date fails, so trying again creates it twice, and an edit keeps its changes behind the error.
  - Where: `src/wardrobe/garment.service.ts` (`create`, `update`), `src/wardrobe/outfit.controller.ts` (`create`, `update`), `src/wardrobe/calendar.controller.ts` (`create`).
  - Found in #29 and #31.
- **A garment without a name has an empty card title on the wardrobe grid** (low).
  - The name is optional. The garment page falls back to the category for its heading; the grid card does not.
  - Where: `views/wardrobe/index.hbs`, the card's `card-title`.
  - Found in #29.
- **A failed save of an edited cut-out looks saved** (medium).
  - After Accept in the mask editor, the garment page posts the new cut-out and shows it whether or not the server took it: the response status is never checked.
  - A fix needs an error message the page can show; `#requestErrorToast` answers htmx requests only.
  - Where: `public/js/background-removal.js:247-255`, `wireUpEditMaskBtn`.
  - Found in #30.
- **The restore brush paints the wrong pixels on a non-square photo with no stored cut-out** (medium).
  - Without a cut-out, `/file/nobg/` serves the original as it is, while the editor's restore source is the original padded to a square, so the two images do not line up.
  - Where: `public/js/background-removal.js:233`, `public/js/mask-editor.js`, `onBothReady`.
  - Found in #30.
- **With site data blocked, a garment's photo cannot be replaced** (low).
  - The photo picker's script reads `localStorage` first, which throws when site data is blocked, so the rest of it never runs and `#photoBtn` stays disabled. `isBgRemovalEnabled` throws the same way.
  - Where: `views/partials/photoPicker.hbs:62`, `public/js/background-removal.js:15`.
  - Found in #30.
- **Colours are stored as typed** (low).
  - Nothing validates `color`: any text is saved, including markup, commas and the same colour twice, and a comma later splits one colour into two. The colour picker now shows such values as text and turns a typed comma into a space, but a direct POST still stores them.
  - Where: `src/wardrobe/dto/create-garment.dto.ts:8`, `src/wardrobe/wardrobe.controller.ts:190-202`.
  - Found in #30.
- **After Back, the new-garment form shows a photo it no longer has** (low).
  - The history snapshot keeps the preview of a chosen photo, but a file input cannot be restored, so Save then posts the garment without it.
  - Where: `views/partials/photoPicker.hbs`, `#photoPreview`; the head script's `htmx:beforeHistorySave` handler in `views/layout.hbs` resets the garment page's file name but not this preview.
  - Found in #30.
- **Background removal logs to the console in production** (low).
  - The library runs with `debug: true`, and three `console.log` calls remain.
  - Where: `public/js/background-removal.js:19,97,179,202`.
  - Found in #30.
- **An outfit loses a garment once that garment is archived** (medium).
  - The builder's rows hold only garments that are not archived, so an outfit whose garment was archived opens in the editor with that row on "No garment", and saving it removes the garment from the outfit. A row whose category has no garment left is dropped altogether.
  - Where: `src/wardrobe/garment.service.ts`, `findAll`; `src/wardrobe/outfit.service.ts`, `buildCategoryRows`.
  - Found in #31.
- **Every save of an outfit with a date adds another calendar entry** (low).
  - The outfit form never shows the dates an outfit already has, and each save that carries a date creates a new entry, so saving twice puts the outfit on the calendar twice.
  - Where: `src/wardrobe/outfit.controller.ts`, `create` and `update`.
  - Found in #31.
- **Categories typed in the outfit builder are case-sensitive, and its suggestions are not translated** (low).
  - "Tops" adds an empty row, since garments are stored as "tops", and the saved slot then disappears from the editor. The category suggestions list the stored English values in every language.
  - Where: `src/wardrobe/outfit.controller.ts`, `rowFragment`; `views/outfits/form.hbs`, `#add-row-suggestions`.
  - Found in #31.
- **Cycling a garment or adding a row in the outfit builder is silent to screen readers** (low).
  - Focus stays on a button still named "Next", and the new garment, or the new row, is not announced.
  - Where: `views/partials/outfit_row.hbs`, Previous and Next; `views/outfits/form.hbs`, Add row. `#outfit-rows-status` could say it.
  - Found in #31.
- **Fast presses on an outfit row's Next are partly lost** (low).
  - A press that arrives while the row's request is running is sent with the old row's index, so three quick presses advance one or two garments.
  - Where: `views/partials/outfit_row.hbs`, Previous and Next.
  - Found in #31.
- **Copy buttons do nothing on an instance served over plain http** (medium).
  - `navigator.clipboard` exists only in a secure context (HTTPS or localhost), so on a LAN address like `http://192.168.1.10:3000` the call throws and nothing is copied or shown.
  - This affects Share on the garment page and every other copy button: outfit and file share, sharing management, the invite link.
  - A fallback (selecting the link in a field, or the Web Share API where available) would cover it.
  - Found in #29.

## Calendar

- **Up to 42 links stand between the keyboard and the week** (medium).
  - On a wide screen the month is open beside the week and each of its days is a link, so Tab passes every day of the month before it reaches the first day of the week.
  - One tab stop for the month with the arrow keys moving between days (the WAI-ARIA date picker grid) would fix it.
  - Where: `views/calendar/index.hbs`, `#cal-month`.
  - Found in #32.
- **Back can bring a removed entry back** (medium).
  - `/calendar` sends no `Cache-Control`, so Chromium and Firefox show the old page from their cache after Back: a removed entry is there again, and its Remove answers 404 with the "request failed" toast. The worn toggle now does what the page shows, even an old one.
  - Where: `src/wardrobe/calendar.controller.ts`, `index`.
  - Found in #32.
- **Removing an entry reloads the whole page** (low).
  - The route answers htmx with `HX-Redirect`, so focus and the scroll position are lost.
  - Where: `src/wardrobe/calendar.controller.ts`, `remove`.
  - Found in #32.
- **There is no previous week, next week or today control, and nothing names the week shown** (low).
  - Weeks change only through the month's days, the page title is the same for every week, and a change of week is not announced.
  - The month marks the shown week with a ring alone, which a screen reader does not report.
  - Found in #32.
- **"Today" is the server's date in UTC** (medium).
  - Outside UTC the calendar marks and opens the wrong day for as many hours a day as the viewer's offset: from 20:00 in New York in summer, until 03:00 in Moscow.
  - Where: `src/wardrobe/calendar.service.ts`, `findWeekBounds` and `parseWeekParam`.
  - Found in #32.
- **The worn toggle may move the VoiceOver cursor on iOS** (low, unconfirmed).
  - Safari does not focus a button on a tap, so htmx has no focus to restore, and the `outerHTML` swap removes the node VoiceOver is on. Playwright's WebKit focuses the button, so this needs a device to check.
  - A fix would keep the button and change only its `aria-pressed` and icon.
  - Where: `views/partials/calendar_worn_button.hbs`.
  - Found in #32.
- **The week starts on Sunday in every language** (low).
  - The calendars of all six languages the app speaks (en-GB, de, es, fr, it, ru) start on Monday.
  - Where: `startOfWeek` and `buildCalendarWeeks` in `src/wardrobe/calendar.service.ts`, and the weekday headings.
  - Found in #32.

## Shell and PWA

- **Push notifications cannot be subscribed from the UI** (high).
  - The layout subscribes only when `document.cookie` contains `access_token`, but that cookie is `httpOnly`, so the check never passes.
  - Where: `views/layout.hbs:222-226`.
  - Found in #25.
- **Share links point at the upstream instance unless `SITE_URL` is set** (high).
  - `SITE_URL` defaults to `https://librecloset.lazz.tech`, and the view context only falls back to the request's host when it is unset, which with that default never happens.
  - Every copied share link (garment, outfit, file) therefore points at someone else's server on an instance started without `SITE_URL`, as the README's quick start is. The same value feeds `twitter:domain` and the JSON-LD `@id`s.
  - A fallback to the request's host has to keep the port (`req.host`, not `req.hostname`), the same issue as the default share images below.
  - Where: `src/app.module.ts:105`, `src/view-context/view-context.service.ts:40`.
  - Found in #29.
- **Most pages are titled with the bare app name** (medium).
  - The layout prints `pageTitle` when a route sets one. The wardrobe and outfit routes set it (PRs 8b and 9a), but the files, sharing, auth, shared-item and chat pages do not, so their tabs and history entries all read "Libre Closet" (WCAG 2.4.2).
  - Where: `views/layout.hbs:52`; `file.controller.ts`, `wardrobe-share.controller.ts`, `auth.controller.ts`, `open-graph.controller.ts`, `app.controller.ts` (`/chat`).
  - Found in #29.
- **After a service-worker update, a search loses its terms** (low).
  - The head script turns a boosted GET into a full load of `requestConfig.path`, which for a GET form is the bare `action`. Reading `detail.pathInfo.finalRequestPath` would keep the query.
  - Where: `views/layout.hbs:207-215`.
  - Found in #28.
- **Default share images drop the port** (low).
  - `og:image` and the JSON-LD image use `req.hostname`, which has no port. They break on an instance reached on a non-default port without a proxy.
  - Where: `src/view-context/view-context.service.ts:29`.
  - Found in #25.
- **Chrome logs "Transition was skipped" when Back follows a boosted navigation** (low).
  - This comes from htmx's global view transitions.
  - Found in #23.

## Accessibility and theme

- **Placeholder text fails contrast** (medium).
  - Every input uses Tailwind preflight's placeholder colour, 50 % of the text colour, which measures 3.35:1 on White.
  - Plan 5.1 maps placeholders to Graphite.
  - Found in #28.
- **A focused control's ring is partly hidden under the header or the dock** (low).
  - `scroll-padding` equals the bars' height, so a control scrolled into view stops flush with the bar and 3.6–4.2 px of its 4 px ring is hidden (Chromium, WebKit; 320×568 and 640×400). About 0.5rem more on both paddings would clear it.
  - Where: `views/assets/main.css:158-159`.
  - Found in #32.
- **Firefox leaves a focused control partly under the dock** (low).
  - It does not scroll a partly visible element out from under the fixed dock: at 360×568 only 19–21 px of a 44 px control can show. A control is never wholly hidden, so WCAG 2.4.11 still passes. `/wardrobe` and `/outfits` do the same.
  - Found in #32.
- **With WCAG 1.4.12 text spacing, a button label that wraps spills out of its button** (low).
  - daisyUI's `.btn` has a fixed height, so a two-line label ("Start over", "Delete outfit" in French, "Kleidungsstück ansehen" at 320 px) crosses the button's border. Nothing is lost.
  - Where: every `.btn`; `h-auto min-h-(--size)` would let them grow.
  - Found in #31.

## Translations

- **"Archived" has the wrong gender for a garment** in es ("Archivado") and ru ("Архивировано") (low). Found in #28.
- **Colour names are never translated** (low).
  - Garment colours are stored as English enum values and shown as they are: "Beige, Brown" on the garment page, the filter chips and the AI chips ("Colour: beige") in every language. There are no `COLOR_*` keys.
  - Where: the `formatColors` helper (`src/main.ts`), `views/wardrobe/index.hbs`, `views/partials/aiSuggestion.hbs`, the colour multiselect.
  - Found in #29.
- **French filter pills put no space before the colon** (low).
  - The pill's name joins the parts with a hard-coded `": "`, so French reads "Retirer le filtre: …" instead of "Retirer le filtre : …".
  - Where: `views/wardrobe/index.hbs:38`.
  - Found in #30.
- **German uses two words for the wardrobe** (low).
  - `WARDROBE` is "Kleiderschrank", while `MY_WARDROBE`, the sharing strings and `WARDROBE_SWITCHER` use "Garderobe".
  - German and Italian also use two words for the calendar section.
  - Found in #26 and #28.
- **Machine-written values await a native speaker** in de, es, fr, it and ru:
  - the copy pass (#26);
  - the eleven error keys (#27);
  - `REMOVE_FILTER` and `WARDROBE_SWITCHER` (#28);
  - the eleven garment-page keys (`BACK`, `REQUIRED`, `EDIT_MASK`, `DELETE_GARMENT`, `CLONED_NAME`, six `PLACEHOLDER_*`) and the re-worded `AI_SUGGEST_WITH` and `AI_SUGGESTED_VIA` (#29);
  - `CHOOSE_PHOTO`, `REMOVE_COLOR`, `CREATE_COLOR`, `COLORS_SELECTED`, `MASK_CANVAS` and the re-worded `MASK_BRUSH_SIZE` (#30);
  - the twelve outfit keys: `NO_GARMENTS_IN_OUTFIT`, `NO_GARMENT`, `VIEW_GARMENT`, `PREVIOUS`, `NEXT`, `MOVE_UP`, `MOVE_DOWN`, `ROW_MOVED`, `REMOVE_ROW`, `DELETE_OUTFIT`, `PLACEHOLDER_OUTFIT_NAME`, `PLACEHOLDER_OUTFIT_NOTES` (#31);
  - the four calendar keys: `TODAY`, `PREVIOUS_MONTH`, `NEXT_MONTH`, `REMOVE_FROM_CALENDAR`, the re-worded `CALENDAR_DELETE_CONFIRM` in es, fr and ru, and fr `CALENDAR_WORN` (#32).

## Tests and tooling

- **The url-import end-to-end tests fail in WebKit** (medium).
  - Under the pinned Playwright Docker image, the import POST arrives with an empty URL, so five tests fail in WebKit and Mobile Safari. They fail on `main` too.
  - Found in #27.
- **A local Playwright run writes into whatever app answers on :3000** (medium).
  - `playwright.config.ts` reuses an existing server, and the smoke test creates garments, so a local run against your own instance adds test garments to your wardrobe.
  - Found in #26.
- **Bare `npx tsc` reports about 96 errors** (low).
  - The Nest build, Jest and ESLint pass, so the errors come from the standalone `tsc` configuration, not the code.
  - Found in #25.
