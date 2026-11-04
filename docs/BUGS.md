# Known bugs

Bugs found while working on this fork and left out of the change that found them, kept here so they can be planned and fixed together.

- A PR that finds a bug it does not fix adds an entry.
- A PR that fixes one removes its entry.

**Severity:**
- **high:** security, data loss, or a feature that does not work.
- **medium:** wrong behaviour that users will hit.
- **low:** cosmetic, rare, or tooling.

## Accounts and security

- **A field typed while a live validation is in flight is not validated when left** (low).
  - The head script puts what was typed into the swapped-in field, but a value set by script fires no `change`, so leaving that field sends no validation. The next edit, or the submit, reports its errors.
  - Where: the head script's `htmx:afterSwap` handler in `views/layout.hbs`.
  - Found in #49.
- **With AUTH_ENABLED=false, anyone can still create an account** (low).
  - `/auth/register` answers without accounts, and since #47 a sign-in lands on the wardrobe rather than a 404. The account does nothing until the operator turns `AUTH_ENABLED` on, but then it works, and it holds the address the owner may want.
  - A 404, or refusing to create the account, would fix it. The register page's own specs (`a11y.spec.ts`, `auth-pages.spec.ts`, `shell.spec.ts`) run against the suite's server, which has no accounts, so they would need a server with accounts first.
  - Where: `src/auth/registration.guard.ts`, `src/auth/auth.controller.ts` (`postRegister`).
  - Found in #47.

## Wardrobe

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
- **Cycling a garment or adding a row in the outfit builder is silent to screen readers** (low).
  - Focus stays on a button still named "Next", and the new garment, or the new row, is not announced.
  - Where: `views/partials/outfit_row.hbs`, Previous and Next; `views/outfits/form.hbs`, Add row. `#outfit-rows-status` could say it.
  - Found in #31.
- **Fast presses on an outfit row's Next are partly lost** (low).
  - A press that arrives while the row's request is running is sent with the old row's index, so three quick presses advance one or two garments.
  - Where: `views/partials/outfit_row.hbs`, Previous and Next.
  - Found in #31.

## Calendar

- **Back can show an entry whose outfit was deleted** (low).
  - Deleting an outfit also removes its calendar entries, but htmx's snapshot of the calendar still holds them, so Back shows them and Remove answers 404 with the "request failed" toast. A removal on the calendar itself drops those snapshots (`public/js/calendar.js`); deleting an outfit does not.
  - Where: the outfit delete route in `src/wardrobe/outfit.controller.ts`.
  - Found in 1.5-c.
- **The worn toggle may move the VoiceOver cursor on iOS** (low, unconfirmed).
  - Safari does not focus a button on a tap, and an `outerHTML` swap removed the node VoiceOver was on. Since 1.5-c the button stays in the page and only its `aria-pressed` changes, which should settle it, but Playwright's WebKit focuses the button, so only a device can tell.
  - Close this entry once someone checks it with VoiceOver on an iPhone.
  - Where: `views/partials/calendar_worn_button.hbs`.
  - Found in #32.

## Shell and PWA

- **After an upgrade, the first page view can show the previous release's icons and manifest** (low).
  - The stylesheet and the app's scripts are asked for with a content hash, so an older service worker's precache cannot answer them. `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `manifest.json` and `assets/icons/` keep their bare URLs and come from the old precache until the new worker takes over.
  - Where: `views/layout.hbs`, `workbox-config.js` (`manifestTransforms`), `src/asset-url.ts`.
  - Found in #55.
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
  - It leaves one under the sticky header too: at 640×400, Shift+Tab from the landing page's footer shows 19 of the 44 px of "Copy command" (#33).
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
- **"AGPL-3.0" can break across lines at its hyphen** (low).
  - A hyphen is a break point, so About's introduction reads "AGPL-" and then "3.0" on the next line (en at 1280 px, de at 320 px).
  - A non-breaking hyphen (U+2011) would hold it together, as the Russian badge does, but the shipped Inter subsets do not draw it, so it comes from a fallback font.
  - Where: `ABOUT_INTRO`, `FOOTER_CREDIT`, `ABOUT_OPEN_SOURCE_DESC`, `WHY_SELF_HOST_DESC_2` and every other value with "AGPL-3.0".
  - Found in #33.
- **Four languages drop part of the landing page's opening paragraph** (low).
  - de, es, fr and it `HERO_DESCRIPTION` leave out "with photos" and the closing "with no subscriptions, no ads and no third-party tracking" that en and ru have. Five languages also shorten `FEATURE_SCHEDULING_DESC`.
  - Found in #33.
- **Machine-written values await a native speaker** in de, es, fr, it and ru:
  - the copy pass (#26);
  - the eleven error keys (#27);
  - `REMOVE_FILTER` and `WARDROBE_SWITCHER` (#28);
  - the eleven garment-page keys (`BACK`, `REQUIRED`, `EDIT_MASK`, `DELETE_GARMENT`, `CLONED_NAME`, six `PLACEHOLDER_*`) and the re-worded `AI_SUGGEST_WITH` and `AI_SUGGESTED_VIA` (#29);
  - `CHOOSE_PHOTO`, `REMOVE_COLOR`, `CREATE_COLOR`, `COLORS_SELECTED`, `MASK_CANVAS` and the re-worded `MASK_BRUSH_SIZE` (#30);
  - the twelve outfit keys: `NO_GARMENTS_IN_OUTFIT`, `NO_GARMENT`, `VIEW_GARMENT`, `PREVIOUS`, `NEXT`, `MOVE_UP`, `MOVE_DOWN`, `ROW_MOVED`, `REMOVE_ROW`, `DELETE_OUTFIT`, `PLACEHOLDER_OUTFIT_NAME`, `PLACEHOLDER_OUTFIT_NOTES` (#31);
  - the four calendar keys: `TODAY`, `PREVIOUS_MONTH`, `NEXT_MONTH`, `REMOVE_FROM_CALENDAR`, the re-worded `CALENDAR_DELETE_CONFIRM` in es, fr and ru, and fr `CALENDAR_WORN` (#32);
  - the ten landing and About keys: `SOURCE_ON_GITHUB`, `COPY_COMMAND`, `WHY_SELF_HOST_DESC_2` (with `WHY_SELF_HOST_DESC` cut to its first sentence), `PRIVACY`, `TERMS`, `ABOUT`, `ABOUT_FORK`, `ABOUT_INSTANCE`, `ABOUT_RUN_BY`, `ABOUT_CONTACT` (#33);
  - `RESET_CODE_SENT` and the re-worded `RESET_FAILED` and `RESET_CODE_FAILED` (#44);
  - the re-worded `DELETE_ACCOUNT_FAILED` (#46);
  - the seven notification keys: `NOTIFICATIONS`, `NOTIFICATIONS_TURN_ON`, `NOTIFICATIONS_TURN_OFF`, `NOTIFICATIONS_ON`, `NOTIFICATIONS_OFF`, `NOTIFICATIONS_BLOCKED`, `NOTIFICATIONS_FAILED` (#54);
  - `COPY_BY_HAND` and `COPY_BY_HAND_TOUCH` (#56);
  - `ERROR_400` (#64);
  - `MASK_SAVE_FAILED` (#68);
  - the re-worded `PRIVACY_SELF_HOSTED_DATA_ITEMS` (1.5-a);
  - `PREVIOUS_WEEK`, `NEXT_WEEK` and `WEEK_OF` (1.5-d).

## Tests and tooling

- **A local Playwright run writes into whatever app answers on :3000** (medium).
  - `playwright.config.ts` reuses an existing server, and the smoke test creates garments, so a local run against your own instance adds test garments to your wardrobe.
  - Found in #26.
- **Bare `npx tsc` reports about 96 errors** (low).
  - The Nest build, Jest and ESLint pass, so the errors come from the standalone `tsc` configuration, not the code.
  - Found in #25.
