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
- **An unreadable date acquired answers 500** (low).
  - Nothing validates `dateAquired`, so a POST to `/wardrobe` with `dateAquired=garbage` reaches `new Date(...)` and fails in the database layer instead of reporting a field error.
  - Where: `src/wardrobe/garment.service.ts`, `create` and `update`.
  - Found in PR 8b.
- **A garment without a name has an empty card title on the wardrobe grid** (low).
  - The name is optional. The garment page falls back to the category for its heading; the grid card does not.
  - Where: `views/wardrobe/index.hbs`, the card's `card-title`.
  - Found in PR 8b.
- **Copy buttons do nothing on an instance served over plain http** (medium).
  - `navigator.clipboard` exists only in a secure context (HTTPS or localhost), so on a LAN address like `http://192.168.1.10:3000` the call throws and nothing is copied or shown.
  - This affects Share on the garment page and every other copy button: outfit and file share, sharing management, the invite link.
  - A fallback (selecting the link in a field, or the Web Share API where available) would cover it.
  - Found in PR 8b.

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
  - Found in PR 8b.
- **Most pages are titled with the bare app name** (medium).
  - The layout prints `pageTitle` when a route sets one. The wardrobe routes set it from PR 8b, but the outfits, files, sharing, auth and shared-item pages do not, so their tabs and history entries all read "Libre Closet" (WCAG 2.4.2).
  - Where: `views/layout.hbs:52`; `outfit.controller.ts`, `file.controller.ts`, `wardrobe-share.controller.ts`, `auth.controller.ts`, `open-graph.controller.ts`.
  - Found in PR 8b.
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

## Translations

- **"Archived" has the wrong gender for a garment** in es ("Archivado") and ru ("Архивировано") (low). Found in #28.
- **Colour names are never translated** (low).
  - Garment colours are stored as English enum values and shown as they are: "Beige, Brown" on the garment page, the filter chips and the AI chips ("Colour: beige") in every language. There are no `COLOR_*` keys.
  - Where: the `formatColors` helper (`src/main.ts`), `views/wardrobe/index.hbs`, `views/partials/aiSuggestion.hbs`, the colour multiselect.
  - Found in PR 8b.
- **German uses two words for the wardrobe** (low).
  - `WARDROBE` is "Kleiderschrank", while `MY_WARDROBE`, the sharing strings and `WARDROBE_SWITCHER` use "Garderobe".
  - German and Italian also use two words for the calendar section.
  - Found in #26 and #28.
- **Machine-written values await a native speaker** in de, es, fr, it and ru:
  - the copy pass (#26);
  - the eleven error keys (#27);
  - `REMOVE_FILTER` and `WARDROBE_SWITCHER` (#28);
  - the eleven garment-page keys (`BACK`, `REQUIRED`, `EDIT_MASK`, `DELETE_GARMENT`, `CLONED_NAME`, six `PLACEHOLDER_*`) and the re-worded `AI_SUGGEST_WITH` and `AI_SUGGESTED_VIA` (PR 8b).

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
