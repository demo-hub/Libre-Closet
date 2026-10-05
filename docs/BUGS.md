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
- **Deleting a garment in a shared wardrobe lands in your own** (low).
  - The redirect drops `ownerId`.
  - Where: `src/wardrobe/wardrobe.controller.ts:530`.
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

## Shell and PWA

- **Push notifications cannot be subscribed from the UI** (high).
  - The layout subscribes only when `document.cookie` contains `access_token`, but that cookie is `httpOnly`, so the check never passes.
  - Where: `views/layout.hbs:222-226`.
  - Found in #25.
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
- **German uses two words for the wardrobe** (low).
  - `WARDROBE` is "Kleiderschrank", while `MY_WARDROBE`, the sharing strings and `WARDROBE_SWITCHER` use "Garderobe".
  - German and Italian also use two words for the calendar section.
  - Found in #26 and #28.
- **Machine-written values await a native speaker** in de, es, fr, it and ru:
  - the copy pass (#26);
  - the eleven error keys (#27);
  - `REMOVE_FILTER` and `WARDROBE_SWITCHER` (#28).

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
