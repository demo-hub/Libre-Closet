# Known bugs

Bugs found while working on this fork and left out of the change that found them, kept here so they can be planned and fixed together.

- A PR that finds a bug it does not fix adds an entry.
- A PR that fixes one removes its entry.

**Severity:**
- **high:** security, data loss, or a feature that does not work.
- **medium:** wrong behaviour that users will hit.
- **low:** cosmetic, rare, or tooling.

## Accounts and security

## Wardrobe

- **Photos are served at full size into small boxes** (low).
  - Grid photos are 1080 px in boxes of about 182 px, so `uses-responsive-images` fails. It is only a warning on `/wardrobe`, `/outfits` and the calendar until this is fixed.
  - Where: `lighthouserc.js` (`photoPages`).
  - Found in #81.

- **A category stored with a capital is offered twice** (low).
  - A garment stored as `Swimwear` adds an option beside the built-in `swimwear`, with the same label, because the check for custom categories is case-sensitive. The same goes for every built-in category.
  - Where: `src/wardrobe/garment-form.ts`, `src/wardrobe/wardrobe.controller.ts` (edit and clone).
  - Found in #88.
- **`$t(...)` in a typed category is expanded in Previous and Next** (low).
  - nestjs-i18n reads nested translations in the text it has just filled in, so a category typed as `$t(lang.SAVE)` gives "Next in Save". Only translation strings can be reached, and the output is escaped.
  - Where: `src/wardrobe/outfit.service.ts` (`buildRow`).
  - Found in #88.

## Calendar

- **Back can show an entry whose outfit was deleted** (low).
  - Deleting an outfit also removes its calendar entries, but htmx's snapshot of the calendar still holds them, so Back shows them and Remove answers 404 with the "request failed" toast. A removal on the calendar itself drops those snapshots (`public/js/calendar.js`); deleting an outfit does not.
  - Where: the outfit delete route in `src/wardrobe/outfit.controller.ts`.
  - Found in #77.
- **The worn toggle may move the VoiceOver cursor on iOS** (low, unconfirmed).
  - Safari does not focus a button on a tap, and an `outerHTML` swap removed the node VoiceOver was on. Since #77 the button stays in the page and only its `aria-pressed` changes, which should settle it, but Playwright's WebKit focuses the button, so only a device can tell.
  - Close this entry once someone checks it with VoiceOver on an iPhone.
  - Where: `views/partials/calendar_worn_button.hbs`.
  - Found in #32.

## Shell and PWA

- **After an upgrade, the first page view can show the previous release's install icons** (low).
  - The layout's icons and the manifest are asked for with a content hash, but the manifest names `assets/icons/` by bare URL, so those come from the old precache until the new worker takes over. Versioning them needs a manifest rewritten for each build, and its hash has to cover the icons too.
  - Where: `public/manifest.json`, `workbox-config.js` (`manifestTransforms`), `src/asset-url.ts`.
  - Found in #55.
- **Axe reports the install prompt's own markup** (low).
  - With `PWA_ENABLED=true`, axe reports `button-name` inside `#pwa-install`, a third-party component, on desktop WebKit, and sometimes `region` on Mobile Chrome, depending on when the component has rendered. `test/a11y.spec.ts` and `test/push.spec.ts` exclude the element.
  - Found in #82.
- **Leaving a field just before a live validation's swap loses its validation** (low).
  - In the moment between the response and the swap, the swap replaces the wrapper and aborts the request the field's `change` just sent. The next edit, or the submit, reports its errors.
  - Where: `data-live-validation` wrappers, the head script in `views/layout.hbs`.
  - Found in #87.
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
  - the re-worded `PRIVACY_SELF_HOSTED_DATA_ITEMS` (#75);
  - `PREVIOUS_WEEK`, `NEXT_WEEK` and `WEEK_OF` (#78);
  - `RESULT_COUNT`, `ALL_ARCHIVED` and `FILTER_ANY`, which replace `RESULTS` (#85);
  - `PREVIOUS_IN_ROW` and `NEXT_IN_ROW`, which replace `PREVIOUS` and `NEXT`, and `ROW_GARMENT` and `ROW_ADDED` (#86).

## Tests and tooling

- **Bare `npx tsc` reports about 96 errors** (low).
  - The Nest build, Jest and ESLint pass, so the errors come from the standalone `tsc` configuration, not the code.
  - Found in #25.
