# Garment Import from URL or Photo

Status: accepted for this fork on 2026-09-06. Revision 3. Drafted 2026-09-05, revised after a three-design review panel; every open decision in section 8 was resolved with the recommended option.

This document plans a feature that lets a user add a garment by pasting a link (shop product page, resale listing, or direct image URL) or by starting from a photo, and have Libre Closet fill in the record automatically: photo, name, category, brand, colours, notes and the source link. The user reviews and corrects before anything is saved.

Deployment context: this fork is intended for personal self-hosting, most likely a single user with `AUTH_ENABLED=false`. That makes the Origin check and rate limiting on the import routes the only protection against a cross-site page driving the server's outbound fetcher, and it means the "hosted instance" caveats below only matter if the work is ever contributed upstream. The PWA share target needs an HTTPS origin and an installed Chromium PWA; a plain-HTTP LAN deployment keeps the paste and camera paths but not the share sheet. Upstream's documentation rule (`.github/prompts/boilerplate.prompt.md`, rule 1) applies to upstream contributions; for this fork this file is the design record.

---

## 1. Summary

- **The new-garment page becomes the funnel.** `/wardrobe/new` gains a photo picker with camera button at the top and an "Import from link" box above it. Every existing entry point (the "+ New Garment" button, the empty-state call to action, the manifest shortcut) already lands there, so no extra tap is added.
- **Nothing is saved until the user taps Save.** The imported or captured photo is held in the browser's file input; extracted fields sit in the form. Save is one multipart request that stores the photo, its cut-out and the garment together, with compensation if the last step fails. Abandoning the page leaves no draft garment and no orphan file.
- **The server does the fetching.** The Content Security Policy (`connect-src 'self'`, `img-src 'self' data: blob:` in `src/main.ts:48-51`) means the browser can neither fetch a shop page nor display a remote image. URL import is therefore a server-side fetch, hardened against SSRF at connect time, and the downloaded image comes back to the page as a same-origin `data:` URI that a small script drops into the same file input the camera uses.
- **Background removal is reused unchanged.** Because the imported image enters the existing `#photoInput`, the current client-side pipeline (square pad, model, mask editor, hidden `nobgPhoto`) runs before save with no changes to `background-removal.js` beyond an options object.
- **No AI required.** Name, brand, colours, category and image come from structured data on the page (JSON-LD `Product`, Open Graph, Shopify JSON) plus small multilingual keyword maps. Photo-first imports get colour suggestions from the cut-out's pixels in the browser. Optional AI enrichment is a later, opt-in, off-by-default phase behind a provider abstraction.
- **Mobile share sheet.** A Web Share Target in the PWA manifest lets Android and desktop Chromium users share a link or a photo from another app straight into the same review page.
- **Ships in small PRs.** Nine PRs of roughly 100 to 400 lines each, matching how features land in this repo. The first fixes a pre-existing Postgres bug the feature would otherwise trip over. One runtime dependency is added (`undici`).

---

## 2. Goals and non-goals

Goals

- Add a garment from a URL with as many fields prefilled as the page allows, including the photo.
- Add a garment starting from a camera or gallery photo in one step, with colours suggested and the cut-out already produced.
- Keep the self-hosted, zero-config Docker promise: works with no new environment variables, SQLite or Postgres, local or S3 storage, `AUTH_ENABLED` on or off, and inside shared wardrobes (`?ownerId` plus `canManage`).
- Every UI string in all six locales.
- Degrade gracefully when a site blocks automated access, which is the common case for large retailers (section 9).

Non-goals for this feature

- Bulk or CSV import (upstream #126). The design leaves a reusable path for it (section 10).
- Hierarchical categories (#127) or storage locations (#125). Import writes only to existing columns plus `sourceUrl`.
- Headless browsers or paid anti-bot services to reach protected retailers.
- Server-side machine learning. Background removal stays in the browser, as today.

---

## 3. What the codebase looks like today

Facts that shape the design, with evidence.

| Fact | Where | Consequence |
| --- | --- | --- |
| Garment creation is two steps: urlencoded `POST /wardrobe`, then htmx multipart `POST /wardrobe/:id/photo` with `photo` and an optional client-produced `nobgPhoto`. | `src/wardrobe/wardrobe.controller.ts:133-183, 390-415`; `views/wardrobe/show.hbs:79-175` | A single multipart save route can reuse the same two-stream storage pattern and create the garment in the same request. |
| `@Body()` is undefined on multipart requests; `attachFieldsToBody` is off and turning it on globally would break the existing `req.files()` routes. | `src/main.ts:58-63`; `@fastify/multipart` 9.4 | The save route iterates `req.parts()`; text inputs must precede the file inputs in the form. |
| `GarmentService.update()` documents the multipart rules: start each file pipeline inside the `for await` loop without awaiting, await after the loop, drain unknown parts with `resume()`. | `src/wardrobe/garment.service.ts:252-290` | The save route copies this shape; an empty-filename `nobgPhoto` part (toggle off) must also be drained or sharp throws "Input Buffer is empty". |
| `FileService.storeImageFromFileUpload` persists the `File` row itself before the garment is flushed. | `local-file.service.ts:70-76`; `s3-file.service.ts:76-82` | "One request" is not "one transaction": a failed garment flush leaves a `File` row and blobs unless the save compensates. |
| Background removal runs only in the browser. Server-side removal was deleted in #69; `/file/nobg/:name` redirects to the original when no variant exists. The client routes the camera input into `#photoInput` with a `DataTransfer` and dispatches `change`. | `public/js/background-removal.js:100-187`; `show.hbs:197-213`; `file.controller.ts:75-93` | Any image placed into `#photoInput` the same way gets the full pipeline. Comments in `background-removal.js:6-7` about a "server-side fallback" are stale. |
| `form.hbs` decides new vs edit by the truthiness of `garment` in the back link, form action and cancel link. | `views/wardrobe/form.hbs:6, 31, 130` | Passing an id-less prefill object as `garment` works once those branches test `garment.id`; every value binding and the colour multiselect already read `garment.*`. |
| Colours are stored as one comma-joined string; the multiselect pre-checks via `ifInArray` and renders non-enum values from `customColors`. | `wardrobe.controller.ts:158-171, 259-274`; `views/partials/colorMultiSelect.hbs:24-41` | Import emits the same shape: lowercase enum values joined by commas, non-enum words as custom colours. |
| `ThrottlerModule.forRoot()` is called with no throttlers, so every existing `@Throttle()` (login, reset code) is inert. `trustProxy` is loopback-only. | `src/app.module.ts:179`; `src/auth/auth.controller.ts:80, 157`; `src/main.ts:19-20` | A limit on import routes only works once a named throttler is declared, and per-IP tracking behind a remote reverse proxy means all users share one bucket. |
| htmx does not swap 4xx/5xx responses and the app configures no `responseHandling`; `ErrorViewFilter` renders a raw English error page. | `views/layout.hbs:42-44`; `src/error-view.filter.ts` | Import failures must be returned as 200 pages with translated inline messages; a 429 from the throttler needs a page-level `htmx:responseError` listener. |
| Migrations run at boot for both drivers; each schema change needs a SQLite file, a Postgres file and both snapshot JSONs. | `src/app.module.ts:215`; `src/dal/dal.module.ts:24-51`; `README.md:211-220` | `sourceUrl` is a four-file change plus the entity. |
| The service worker only routes GET requests; a POST share target passes straight to the network. | `views/assets/src-sw.ts:90` | No service worker change is needed for the share target to work online. |
| No HTTP client, HTML parser, or AI SDK is a dependency. Node 22's bundled undici is not importable. | `package.json`; `node -p process.versions.undici` | `undici` is added for the guarded agent. HTML extraction is done with a small linear tokenizer, no parser dependency. |

### 3.1 Pre-existing bugs the feature would hit

The first two block the feature.

1. **Postgres colour column is `smallint`.** Migration `Migration20260612010041.ts:13` ran `alter column "color" type smallint`; the SQLite twin rebuilt the table with `color integer`. The entity declares `@Enum({ nullable: true }) color?: GarmentColor` without `items`, so MikroORM inferred a numeric enum. SQLite's type affinity silently stores `'red,blue'` as text; Postgres rejects it with `invalid input syntax for type smallint`. CI never creates a garment with a colour on the Postgres job, so this has gone unnoticed since v0.4.0. Upstream carries the same migration.
2. **Rate limiting is inert** (table above). The import endpoint makes outbound requests on the user's behalf and must be limited.
2a. **SQLite table rebuilds inside a migration cascade-delete `outfit_garments`.** MikroORM runs migrations in a transaction, `pragma foreign_keys = off` is a no-op while a transaction is open, and `drop table garment` then fires the join table's `on delete cascade`. This is the mechanism behind upstream #129 and it recurs in every MikroORM-generated garment rebuild (`Migration20260416215236.ts`, `Migration20260612010037.ts`). Any future column-type change on `garment` must use an in-place `add column / update / drop column / rename column` swap instead; PR 0 does so and removes the rebuild from the v0.4.0 migration.
2b. **The colour filter is exact-match.** `findAll` filters with `{ color: dto.color }` (`garment.service.ts:64`), so a garment stored as `red,blue` never matches a filter for `red`. Pre-existing; a `$like` match or a normalised table is a follow-up once import makes multi-colour garments common.
3. `wireUpEditMaskBtn` posts `/wardrobe/:id/nobg` without `?ownerId`, so mask editing fails for garments in a shared wardrobe you manage (`background-removal.js:222`; `wardrobe.controller.ts:446-459`).
4. Postgres `name`, `brand`, `notes`, `size`, `category` are `varchar(255)`; SQLite is unbounded. Scraped descriptions overflow `notes`.
5. `remove()` and `deleteOldPhoto()` leave `File` rows behind (`garment.service.ts:315-326, 351-353`).
6. Five locales are missing `GARMENT_SAVED` and `PHOTO_SAVED`; `ru` also lacks `SCREENSHOTS_TITLE`. They fall back to English silently.
7. `layout.hbs:42-44` emits two `<meta name="htmx-config">` tags; htmx reads one, so `disableInheritance` may be inert.

---

## 4. User experience

### 4.1 Entry points

- `/wardrobe/new` is the funnel. The "+ New Garment" button, the empty-state call to action, the outfit-builder link and the manifest "Add Garment" shortcut already point there. No chooser page, no extra tap.
- Optional deep links: `?mode=link` focuses the URL field, `?url=` prefills it, `?sourceUrl=` prefills only the source-link field. A fourth manifest shortcut "Import from link" uses `?mode=link`.
- The dock is left alone; it is global navigation and the wardrobe index already owns the bottom of the screen.

### 4.2 The new-garment page, top to bottom

1. **Import from a link** (hidden when `IMPORT_URL_ENABLED=false`): a URL input with `inputmode="url"` and an Import button, its own small form with `hx-post="/wardrobe/import/url"`, `hx-target="main"`, `hx-select="main"`, `hx-swap="outerHTML"`, an indicator ("Reading the page…") and `hx-disabled-elt="this"` against double taps. A one-line hint says the server fetches the page and some shops block automated access.
2. **Photo picker** inside the main form: the square preview, gallery input, hidden camera input with `capture="environment"`, camera button, background-removal toggle and status text, extracted verbatim from `show.hbs:96-175` into a partial so the camera workaround for #99 and its e2e contract carry over unchanged.
3. **Fields**: name, category (required, datalist of enum plus the user's categories), brand, colour multiselect, size (datalist of variant sizes when a page exposes them), washing details, date acquired, notes, and a new **Source link** input.
4. **Cancel / Save.** Save is disabled while background removal runs and re-enabled in its `finally`.

The mask editor dialog is included once via a partial extracted from `show.hbs:336-395`.

### 4.3 Import from link

1. User pastes a URL and taps Import.
2. Server validates the URL, fetches the page (or the image, if the URL points at one), extracts metadata, downloads the best product image, validates and re-encodes it, and re-renders the same page at HTTP 200 with: an alert "Details imported from nike.com. Check them before saving", the preview `<img>` carrying a `data:image/webp;base64` URI, fields prefilled with a "Suggested" badge next to each, matching colour boxes checked (unknown explicit colours as pre-checked custom colours), Source link filled, and up to four "Image 2 / 3 / 4" buttons for alternative candidates.
3. The page's inline script reads the preview's `src` (via `getAttribute`, because Handlebars escapes `=` in the base64 and the parser decodes it), converts it to a `File`, injects it into `#photoInput` and dispatches `change`. The existing pipeline runs: square pad, model, mask editor, hidden `nobgPhoto`. If the server flagged the image as already having an alpha channel, the model run is skipped.
4. User edits, taps Save. One multipart request creates file and garment and redirects to `/wardrobe/:id?created=1`, where the existing "Garment saved" toast shows. The show page gains an "Imported from" row linking the source.

Alternative candidates post to the same import route with `imageUrl=<candidate>` and swap only the preview; nothing is downloaded until tapped.

**Failure path.** The page is re-rendered at 200 with the pasted URL kept, the Source link prefilled so the link is saved even when nothing else could be read, and one of six translated states: `IMPORT_URL_INVALID` (scheme, credentials, port, private or local host), `IMPORT_SITE_BLOCKED` (403, 429, challenge markers such as "Access Denied", "Just a moment", `bm-verify`, `captcha-delivery`), `IMPORT_PAGE_UNREACHABLE` (DNS, timeout, 5xx), `IMPORT_NO_IMAGE_FOUND` (fields still prefilled, hint to add a photo or paste a direct image link), `IMPORT_IMAGE_INVALID` (not a supported raster image or too large), `IMPORT_DISABLED`. The camera and gallery controls remain right below.

### 4.4 Start with a photo

1. Tap the camera button (one tap: the hidden capture input opens the camera app) or pick from the gallery.
2. Background removal runs as today; the mask editor opens; the preview switches to the cut-out.
3. Once the cut-out exists, colours are suggested in the browser from its opaque pixels and the matching boxes are checked with "Suggested" badges (section 5.5). No server round trip.
4. Fill in category, tap Save.

### 4.5 Share from another app (Android and desktop Chromium)

Sharing a product link or a photo to the installed PWA posts to `/wardrobe/import/share`. Links follow the URL path, photos are re-encoded in memory into the `data:` preview, and the server renders the same page prefilled. Because an OS share cannot carry `?ownerId`, the page shows a destination selector ("My wardrobe" plus wardrobes shared with manage permission) whose value is re-checked with `canManage` on Save. iOS Safari and Firefox do not support share targets, so paste and camera remain the universal route.

### 4.6 Suggested badges

Every prefilled value carries a `badge-ghost` "Suggested" label and a `data-suggested` attribute; a one-line hyperscript `on input` removes the badge when the user edits the field, so the badges act as an honest "unreviewed" indicator on a form where most values are guesses. Category is never guessed as `other`: when the mapper has no confident match the field stays empty and the required attribute forces a choice.

### 4.7 Why hold the image in the browser and save once

Three designers evaluated this independently and all chose the same approach.

| Approach | For | Against |
| --- | --- | --- |
| **Client-held image, single multipart save** (chosen) | Nothing persisted until Save, so no draft garments in the grid, filters, outfit builder or share pages, and no orphan files (the repo has no cleanup job). The imported image goes through the unchanged background-removal pipeline before save, so the cut-out exists from the first render. One write, with the existing owner and `canManage` logic; nothing to attach later, nothing to reap; identical on SQLite/Postgres and local/S3. | Requires JS to carry the photo (the page already requires it for background removal). The page carries a 100 to 400 KB base64 image once. A reload loses the imported photo; the user re-imports. |
| Create the garment on import, review on the edit form | Survives an interrupted mobile share; reuses edit and delete routes. | A visible half-reviewed garment on every abandonment, in every list and the outfit builder, unless a draft flag is threaded through all queries. Managers of shared wardrobes cannot Discard (delete is owner-only). Background removal becomes a post-save step needing a new client routine and a round trip. |
| Pending `File` row plus a hidden id on the form | No draft garments. | Orphan files and blobs on abandonment; a new ownership check when attaching by id (none exists today); the cut-out cannot be produced before a garment exists because `/wardrobe/:id/nobg` needs one. |

---

## 5. Architecture

### 5.1 Module layout

Import lives inside the existing `WardrobeModule` as a small controller and service, rendering the existing `wardrobe/form` template. No new Nest module, no new page.

```
src/wardrobe/import/
  import.controller.ts        @Controller('wardrobe/import'): POST /url, POST / (save), POST /share, POST /analyze (AI phase)
  import.service.ts           fromUrl(url, ctx) → ImportResult; save(parts, owner) with compensation; share dispatch
  garment-prefill.ts          GarmentPrefill type (persistence-free, reused by bulk import later)
  safe-fetch.ts               SSRF-guarded undici Agent, redirect loop, byte and time caps
  url-policy.ts               pure: scheme, port, userinfo, host checks; net.BlockList deny list
  page-metadata.ts            linear tokenizer: JSON-LD blocks, <meta>, <title>, <link rel=image_src>, <h1>
  product-draft.ts            precedence rules: JSON-LD walker, variant selection, name cleaner, brand rules, image candidates
  shopify-products-json.ts    /products/<handle>.js fast path
  category-mapper.ts          multilingual keywords → GarmentCategory or existing custom category (the only place category semantics live)
  color-mapper.ts             colour words → GarmentColor[] (+ pattern); normaliseColors helper shared with the controller
  image-intake.ts             magic bytes → sharp metadata allowlist → preview transcode to data: URI
  ai/                         (AI phase) GarmentEnricher, Null / Anthropic / OpenAI-compatible providers, factory
  __fixtures__/               trimmed HTML fixtures under 10 KB
  *.spec.ts
views/partials/photoPicker.hbs   extracted from show.hbs:88-174 (same ids and attributes)
views/partials/maskEditor.hbs    extracted from show.hbs:336-395
views/wardrobe/form.hbs          new mode: import box, photo picker, Source link, badges; branches test garment.id
public/js/background-removal.js  wireUpPhotoInput({ submitBtnId, onNobg }); suggestColorsFromBlob(); ownerId in wireUpEditMaskBtn
```

`GarmentPrefill` is the seam for later bulk import: `{ name?, category?, brand?, colors: string[], customColors: string[], size?, sizeOptions: string[], notes?, sourceUrl?, imageCandidates: string[], confidence: Record<field, number> }`.

### 5.2 Routes

All import routes sit behind `@UseGuards(ConditionalAuthGuard)` and replicate the owner pattern from `wardrobe.controller.ts:150-156`: `userId = req.user?.userId`; `viewOwner` is parsed from `?ownerId` (or the destination selector field) only when `userId != null`; if `viewOwner !== userId` then `shareService.canManage(userId, viewOwner)` must pass; the garment owner and `File.createdBy` are `viewOwner ?? userId`. Computing `viewOwner` only when a user is logged in also avoids the existing quirk where an `?ownerId` is forwarded to `create()` under `AUTH_ENABLED=false`.

| Method | Path | Body | Purpose | Response |
| --- | --- | --- | --- | --- |
| GET | `/wardrobe/new` (existing, modified) | | Also passes `importUrlEnabled` and `aiProvider` flags; honours `?mode`, `?url`, `?sourceUrl`. | Full page |
| POST | `/wardrobe/import/url` | urlencoded `url`, or `imageUrl` for an alternative candidate | Fetch, extract, download and validate image, transcode to `data:` preview, re-render the form prefilled. | 200 full page (htmx swaps `main`); preview partial when `imageUrl` |
| POST | `/wardrobe/import` | multipart: text fields, `sourceUrl`, `ownerId`, then `photo`, `nobgPhoto` | Save. `req.parts({ limits: { files: 2 } })`; fields collected; `photo` → `storeImageFromFileUpload(part, owner, photoFileName)` and `nobgPhoto` → `storeNobgVariantFromStream(part.file, photoFileName)` started inside the loop, awaited after; empty-filename and unknown parts drained; then `GarmentService.createWithPhoto(dto, photo, owner)`; on failure `FileService.discard(file)`. Missing category re-renders at 200 with `filterErrors`. | `HX-Redirect` or 303 to `/wardrobe/:id?created=1[&ownerId]` |
| POST | `/wardrobe/import/share` | multipart `title`, `text`, `url`, `photo[]` (share target) | First http(s) URL in `url`, then `text`, then `title` → URL path; first `photo` part → in-memory re-encode to `data:` preview; renders the form. Never saves. | 200 full page |
| POST | `/wardrobe/import/analyze` | multipart `nobgPhoto` or `photo` (AI phase) | Runs the configured enricher on a downscaled JPEG; returns a server-rendered fields fragment that fills only empty inputs, with "Suggested by AI" badges. | htmx partial |

Unchanged: `POST /wardrobe` (urlencoded create stays for back-compat and the existing e2e), `POST /wardrobe/:id` (gains `sourceUrl`), `GET /wardrobe/:id/edit`, `DELETE /wardrobe/:id`, `POST /wardrobe/:id/nobg`, `POST /wardrobe/:id/photo`.

The form in new mode posts multipart to `/wardrobe/import`; in edit and clone modes it keeps posting urlencoded to the existing routes. Static `/wardrobe/import` and `/wardrobe/new` coexist with `/wardrobe/:id` because the router prefers static segments.

### 5.3 Data model

Two changes on `Garment`, in one migration pair:

```ts
@Property({ nullable: true, columnType: 'text' })
public sourceUrl?: string;

@Property({ nullable: true, columnType: 'text' })   // was varchar(255) on Postgres
public notes?: string;
```

```sql
-- sqlite (notes already text)
alter table `garment` add column `source_url` text null;
-- postgres
alter table "garment" add column "source_url" text null;
alter table "garment" alter column "notes" type text using ("notes"::text);
-- down: drop source_url; notes back to varchar(255)
```

`text` for `sourceUrl` because product URLs routinely exceed 255 characters; widening `notes` avoids truncating scraped descriptions mid-sentence. Both `.snapshot-*.json` files gain a `source_url` entry (copy the `washing_details` entry) and an updated `notes` entry. `name`, `brand` and `size` stay `varchar(255)`; imported values are truncated to 255 and `sourceUrl` to 2048.

Prerequisite repair (PR 0, done): the entity becomes `@Property({ nullable: true, columnType: 'text' }) color?: string` (the `GarmentColor` enum stays as the suggestion list, and `text` rather than `varchar(255)` so long custom-colour lists cannot overflow on Postgres); Postgres migrates `color` to `text` (down to `varchar(255)`); SQLite swaps the column in place (`add column`, `update`, `drop column`, `rename column`) because a MikroORM table rebuild inside the migration transaction cascade-deletes `outfit_garments` (section 3.1); both snapshots updated. The two v0.4.0 migrations lose their destructive statements (the Postgres `smallint` cast, the SQLite rebuild) so databases stuck on them can finish upgrading; already-migrated databases are unaffected because migrations are tracked by name. Any future enum column must use `@Enum({ items: () => X })` or a plain string property.

DTOs: `CreateGarmentDto` gains `sourceUrl?: string` and `photo?: File` (the already-stored file); `UpdateGarmentDto` gains `sourceUrl` and types `color` as `string`. `clone()` copies `sourceUrl`.

### 5.4 URL import pipeline

1. **Policy** on `new URL(input)`, which canonicalises obfuscated literals such as `0x7f000001` and `127.1`: scheme `http:`/`https:`; empty username and password; port empty, 80 or 443; hostname not `localhost`, `*.localhost`, `*.local`, `*.internal`; literal IPs checked against the deny list.
2. **Fetch** through the guarded agent (section 5.9) with `redirect: 'manual'`, up to 5 hops re-validated, browser-like `User-Agent`, `Accept`, `Sec-Fetch-*` headers and `Accept-Language` from the user's locale with `en` first (so localised sites such as Vinted return English colour and category strings). Total deadline `IMPORT_FETCH_TIMEOUT_MS` (default 10 s); HTML capped at 3 MiB decompressed.
3. **Branch** on content: `text/html` or `application/xhtml+xml` is parsed; a body that sniffs as an image becomes a direct image import (name from the humanised file-name stem).
4. **Shopify fast path.** If the path matches `/products/<handle>`, fetch `<origin>/products/<handle>.js` first: public JSON with title, vendor, product type, variants and images, rarely bot-blocked.
5. **Tokenize** with linear regular expressions over the capped buffer (no nested quantifiers; pathological-input specs): every `<script type="application/ld+json">` block parsed in its own try/catch and normalised across object, array and `@graph` shapes with `@type` as string or array; the `<meta>` map (`property=` and `name=`, first `og:*` wins, repeated `og:image` collected in order with `:secure_url`, `:width`, `:height`); `<title>`; `<link rel="image_src">`; first `<h1>`; charset from `Content-Type` or `<meta charset>` via `TextDecoder`. Microdata is deferred; `node-html-parser` (CJS, 2 deps, 14 to 29 ms on 1 to 2 MB pages) is the documented upgrade if it is wanted.
6. **Walk JSON-LD**: collect nodes whose `@type` includes `Product`, `ProductGroup`, `IndividualProduct` or `ProductModel`, recursing `hasVariant`, `isVariantOf`, `mainEntity`, `offers.itemOffered`; choose the variant whose `sku`, `gtin`, `color` or `url` matches the page URL's path or query, else the first, with group fields as fallback.
7. **Field precedence**
   - name: variant `Product.name` unless it merely appends colour and size → group name → `og:title` → `twitter:title` → `<title>` → `<h1>`; then strip `| Site`, `. Nike.com`, `- Official Store` suffixes (using `og:site_name`, hostname and brand) and variant tails; collapse whitespace; cap 255.
   - brand: JSON-LD `brand.name` (variant, then group, then `isVariantOf.brand`) → `manufacturer.name` → `product:brand` → `og:site_name` unless the host is a marketplace (Vinted, Depop, eBay, Grailed, Vestiaire, Poshmark, Mercari, Etsy, Amazon, Zalando, ASOS, Farfetch, SSENSE, Yoox, …) → whole-word match of the title against the user's existing brands → empty. Never guess from the hostname on marketplaces.
   - image candidates: variant image → other variant images → product or group image → `og:image` list (largest declared first, `secure_url` preferred) → `twitter:image` → `itemprop=image` → `link[rel=image_src]`; absolutised against the page URL and deduped. The first candidate that downloads and passes the image checks becomes the preview; up to four more are offered as buttons.
   - category: JSON-LD `category` (last `>` or `/` segment, gender words stripped) → `BreadcrumbList` names → `product:category` → title → URL path segments, through `category-mapper` (Appendix A): an enum value or one of the user's existing custom categories, else empty.
   - colours: variant `color` → `Product.color` → `product:color` → colour words in the cleaned name after removing the brand string; split on `/`, `,`, `&` and the per-language "and"; mapped through `color-mapper`; at most three; `pattern` added for pattern words; unmapped words from an explicit colour field kept as custom colours. Descriptions are never scanned for colours.
   - size: **not guessed**. Prefilled only when the page is a single-item listing with exactly one `Product`, no variants, at most one `Offer` and a scalar size, or when `product:size` exists, or when the URL query names a size (`size=`, `sz=`, `taille=`, `talla=`, `größe=`). Otherwise variant sizes become a `<datalist>` on the size input and the field stays empty. Normalised through the existing `normalizeSize()`.
   - notes: description (JSON-LD → `og:description` → `meta[name=description]`), tags stripped, about 500 characters, plus a line with price, currency and condition when present.
   - `sourceUrl`: canonical URL (`og:url` when same host, else the final URL after redirects) with fragment and `utm_*`, `fbclid`, `gclid` parameters removed.
8. **Image intake**: reject `text/html` early (challenge page); 12-byte magic allowlist (JPEG `FF D8 FF`, PNG signature, `GIF87a`/`GIF89a`, `RIFF….WEBP`, `ftyp` at offset 4) before sharp; `sharp(buf, { failOn: 'error', limitInputPixels: 50e6 }).metadata().format` in `{jpeg, png, webp, gif, heif}`, explicitly rejecting `svg` and `tiff`; then `autoOrient → webp q90 → resize 1080 inside, withoutEnlargement` to a base64 `data:` URI plus a `hasAlpha` hint.
9. **Result**: the form re-rendered with the prefill under the `garment` variable (id-less), `customColors`, `suggested` map, preview and candidates; or the failure state.

### 5.5 Photo path and colour suggestion

- Save reuses `storeImageFromFileUpload` and `storeNobgVariantFromStream` exactly as `update()` does, with a pre-generated `photoFileName` so the cut-out lands beside the original. The stored original keeps its aspect ratio; the cut-out is square. No server-side padding.
- `suggestColorsFromBlob(blob)` in `background-removal.js`: draw the cut-out to a 48×48 canvas, skip pixels with alpha below 128, bucket the rest in HSL (black L < 0.15; white L > 0.9 and S < 0.12; grey S < 0.12; beige low S, L 0.6 to 0.85, hue 20 to 50; brown hue 15 to 45, S > 0.2, L < 0.45; then hue bands for red, orange, yellow, green, blue, purple, pink), keep buckets above 20 % coverage, add `pattern` when three or more are balanced, never suggest gold or silver. Called from the new `onNobg` hook; it checks the matching colour boxes only when none is selected and dispatches `change` so the multiselect re-renders its pills. Zero round trip, works offline in the installed PWA.

### 5.6 Background removal integration

- `wireUpPhotoInput({ submitBtnId = 'photoBtn', onNobg })`: the new form passes its Save button id; `onNobg` swaps the preview to the cut-out and triggers colour suggestion. Pipeline logic untouched.
- The imported `data:` image is injected into `#photoInput` with `DataTransfer` and a dispatched `change`, the trick `show.hbs:206-213` already uses for the camera. Decoding uses `atob`, not `fetch()` (blocked for `data:` by `connect-src`).
- When the server marks the imported image `data-has-alpha`, the model run is skipped (transparent PNG packshots need no removal); the user can still trigger it.
- Mask editor behaviour after a link import: keep the existing auto-open for consistency with uploads, with the `hasAlpha` skip. An explicit "Edit mask" button instead of auto-open was considered and set aside (section 8), and the auto-open was confirmed in use.
- `wireUpEditMaskBtn(fileName, garmentId, ownerId)` appends `?ownerId=` to its POST, fixing mask editing in shared wardrobes; the stale "server-side fallback" comments are corrected in the same change.

### 5.7 Optional AI enrichment (separate, gated phase)

Off by default and never automatic. A **Suggest details** button appears on the new-garment page only when a provider is configured; its label names the destination host ("Suggest details with AI via api.anthropic.com"), and the click is the per-use consent. In shared wardrobes the button is shown to the wardrobe owner only.

- `GarmentEnricher` interface with `analyzeImage(jpeg, ctx)` and `normalizeText(text, ctx)`; providers chosen by a factory on `AI_PROVIDER`, mirroring how `FileModule` picks local or S3. `NullEnricher` when `none`.
- One JSON schema portable across Anthropic structured outputs, OpenAI strict mode and Ollama's grammar: objects, strings, numbers, arrays and enums only, `additionalProperties: false`, every property required, unknowns encoded as `''` or `[]`, no `min`/`max`. Fields: `name`, `category` (the 8 enum values), `category_suggestion` (free text, matched server-side to the user's custom categories so the schema stays stable per instance), `colors` (enum array), `pattern`, `material`, `brand` (only from a legible logo or label), `notes`, `confidence {category, colors, brand}`. No `size` in the vision schema; the text schema accepts `size` only with a verbatim `size_quote` found in the page text.
- Anthropic provider: `POST https://api.anthropic.com/v1/messages` with `x-api-key` and `anthropic-version` headers, structured outputs via `output_config.format` (`json_schema`), the image as a base64 block before the text block, low effort, a byte-identical cacheable system prompt, default model `claude-opus-5` overridable through `AI_MODEL` (`claude-haiku-4-5` documented as the cheaper choice). `stop_reason` of `refusal` or `max_tokens` degrades to "no suggestions". Implemented with raw `fetch` so the feature adds no AI dependency; the official `@anthropic-ai/sdk` (`client.messages.parse`, typed errors) is the alternative if the maintainer prefers it.
- OpenAI-compatible provider: `POST ${AI_BASE_URL}/chat/completions` with a `data:` image URL (Ollama rejects http image URLs) and `response_format: { type: 'json_schema', … }`, retrying once with `json_object` plus the schema in the prompt for older servers. Works unchanged with Ollama, llama.cpp, vLLM, LM Studio and OpenAI; the operator-configured host is trusted and not subject to the SSRF deny list.
- Cost: a 1024 px image is about 1369 tokens (`ceil(w/28) × ceil(h/28)`); with prompt and output, roughly $0.017 per garment on Opus 5 and $0.0035 on Haiku 4.5. Local models are free.
- Every provider response is validated server-side: enum membership, confidence clamped to [0, 1], HTML and URLs stripped, lengths truncated. Page text is passed as quoted, untrusted data. The response is a server-rendered fields fragment (`reply.viewPartial`), not JSON filled in by ad-hoc DOM scripting, matching the repo's server-rendering rule.
- Disclosure: `PRIVACY_AI_*` copy on `/privacy` rendered only when a provider is configured; README states what leaves the server (a downscaled JPEG of the garment, extracted page text, UI language, custom category names), to which host, and when. If this work is ever contributed upstream, the hosted instance must keep `AI_PROVIDER=none` unless its privacy text is updated. Server-side local inference is rejected: it contradicts the "no GPU needed" positioning.

### 5.8 Web Share Target

Manifest addition (`public/manifest.json`):

```json
"share_target": {
  "action": "/wardrobe/import/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "title": "title", "text": "text", "url": "url",
    "files": [{ "name": "photo", "accept": ["image/jpeg", "image/png", "image/webp", "image/gif"] }]
  }
}
```

- One POST target handles links, text and photos; a GET target cannot carry files and only one target is allowed. Declare `text`, or Chromium turns shared text into a fake `shared.txt` file. On Android the URL usually arrives in `text`. HEIC is excluded because the prebuilt sharp cannot decode it.
- The server receives the POST directly; no service worker change is needed online. Chromium sends the session cookie (a browser-initiated top-level navigation counts as same-site), but an expired session hits the guard's 302 and the multipart body is lost. Follow-up (own PR): a Workbox `POST` route that stashes `formData()` in the Cache API under a random id and redirects to a fixed same-origin `/wardrobe/new?shared=<id>`, plus `returnTo` on the login redirect restricted to same-origin paths; the page then injects the stashed file with the same `DataTransfer` trick. This also makes offline shares survive.
- Support: Chrome Android 76+, Chrome and Edge desktop 89+, Samsung Internet, Opera. Not iOS Safari, not Firefox, not GMS-less Android (share targets need a Google-minted WebAPK over HTTPS). Manifest updates reach installed apps at most daily. Documentation says "Android and desktop Chromium", not "any app".
- The manifest is static and precached (`workbox-config.js`); `npm run build` regenerates the precache. `PWA_ENABLED=false` still advertises the target, which is harmless because the server route is the feature.

### 5.9 Security

**SSRF.** The guard lives at connect time, so DNS rebinding has no window. Node skips `lookup` entirely for literal IP hosts, which is why the connector wrapper exists: a lookup-only guard was verified to let `http://127.0.0.1/` and `http://[::1]/` through.

```ts
import { Agent, buildConnector, fetch } from 'undici';
import * as net from 'node:net';
import * as dns from 'node:dns';

const guardedLookup = (host, opts, cb) =>
  dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [addrs];
    const bad = list.find((a) => isBlocked(a.address));
    if (bad) return cb(new SsrfError(`blocked ${bad.address} for ${host}`));
    return opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
  });
const inner = buildConnector({ lookup: guardedLookup, timeout: 10_000 });
const guardedConnect = (opts, cb) => {
  const h = opts.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(h) && isBlocked(h)) return cb(new SsrfError(`blocked literal ${h}`), null);
  inner(opts, cb);
};
export const importAgent = new Agent({ connect: guardedConnect, headersTimeout: 8_000, bodyTimeout: 8_000 });
// fetch(url, { dispatcher: importAgent, redirect: 'manual', signal })
```

- Deny list via `net.BlockList`, type derived from `net.isIP` so IPv4-mapped IPv6 is caught: IPv4 `0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4`; IPv6 `::/128, ::1/128, ::ffff:0:0/96, 64:ff9b::/96, 64:ff9b:1::/48, 100::/64, 2001:db8::/32, 2002::/16, fc00::/7, fe80::/10, ff00::/8`. `IMPORT_ALLOW_PRIVATE_NETWORKS` relaxes only RFC 1918 and ULA ranges, never loopback, link-local or metadata.
- Redirects followed manually (max 5), each hop re-validated, `Location` resolved relative to the current URL. Deadline via `AbortSignal.any` with a timeout; bodies read as streams counting decompressed bytes and aborting past the cap, because fetch inflates gzip and br. Header and body timeouts at 8 s because several retailers tarpit bot user agents for more than 12 s.
- The guarded agent is used only by `safe-fetch.ts`, never as the global dispatcher, because the S3 client may legitimately talk to a LAN MinIO. Fetched bodies are never relayed to the browser; only extracted strings and a sharp-re-encoded image are.
- Browser-like headers are a deliberate, disclosed choice (an honest bot user agent was blocked or tarpitted by 15 of 24 probed retailers versus 11 with browser-like headers). No crawler user agents (verified-bot programmes make it pointless), no headless browsers.

**Cross-site triggering.** Import POSTs (`/url`, `/share`, `/analyze`) require `Sec-Fetch-Site` in `{same-origin, none}` or a host-matching `Origin` header. htmx sends both; the OS share POST arrives with `none`. On `AUTH_ENABLED=false` instances there is no session at all, so this small localised check is what stops a cross-site page from driving the server's outbound fetcher or AI spend. The rest of the app has no CSRF protection today; extending it app-wide is a separate decision.

**Abuse.** Declare a real throttler: `ThrottlerModule.forRoot([{ name: 'default', ttl: minutes(1), limit: 600 }])`, `@Throttle({ default: { limit: 10, ttl: minutes(1) } })` on `/import/url` and `/import/share`, `@Throttle({ default: { limit: 10, ttl: minutes(10) } })` on `/import/analyze`, and `@SkipThrottle()` on `GET /file/:fileName` and `GET /file/nobg/:fileName` (a wardrobe grid of 100 garments fires 100 image requests). Tracking stays per IP; a per-user tracker must key on a verified JWT, never on the raw cookie value. This also activates the existing login and reset-code limits. The import page registers an `htmx:responseError` listener showing `IMPORT_TRY_AGAIN_LATER` for 429 and 403, which htmx would otherwise drop silently.

**Compensation.** `FileService.discard(file)` deletes the original blob, the `-nobg` blob and the `File` row; the save route calls it when the garment flush fails after the file pipelines resolved. The same helper can later fix the pre-existing leaks in `remove()` and `deleteOldPhoto()`.

**Injection.** Extracted text renders through double-stash Handlebars only; AI output is validated against enums; `sourceUrl` renders as a link only when it parses as http(s), with `rel="noopener noreferrer nofollow"`, `target="_blank"` and `hx-boost="false"`. Page text passed to an AI provider is quoted as data.

**Legal.** Copying a product photo into a private wardrobe is personal use; keep it per-user, on demand, uncached, and note that imported images appear on public share links like any other photo.

### 5.10 Configuration

All values are read through `ConfigService`, validated in the Joi schema in `src/app.module.ts:66-162`, documented in the README table, with commented examples in `.env`. Knobs are kept to a minimum; fetch caps (3 MiB HTML, 15 MiB image, 5 redirects, 50 M pixels) are code constants.

| Variable | Default | Purpose |
| --- | --- | --- |
| `IMPORT_URL_ENABLED` | `true` (decided, section 8) | Kill switch for outbound fetching. When false, `/wardrobe/import/url` returns 404 (the `AuthGuard` idiom) and the link box is hidden via a view-context flag. Photo import and the share target keep working. |
| `IMPORT_ALLOW_PRIVATE_NETWORKS` | `false` | Development, testing and LAN-shop use: permits RFC 1918 and ULA targets, never loopback or metadata. |
| `IMPORT_FETCH_TIMEOUT_MS` | `10000` | Whole-request deadline for page and image fetches. |
| `AI_PROVIDER` | `none` | `none`, `anthropic`, `openai-compatible`. |
| `AI_MODEL` | `claude-opus-5` when anthropic; required when openai-compatible | Passed through unchanged (for example `qwen3-vl:8b` on Ollama). |
| `AI_API_KEY` | required iff `anthropic`; optional otherwise | Anthropic key, or bearer token for OpenAI-compatible servers. |
| `AI_BASE_URL` | required iff `openai-compatible` | For example `http://ollama:11434/v1`. |

`ViewContextService.buildContext` exposes `importUrlEnabled`, `aiProvider` and `aiHost` so templates can gate UI like they do with `pwaEnabled`.

---

## 6. Delivery plan

Each PR passes `npm run precommit`, adds one line under `## Unreleased` in `CHANGELOG.md`, adds i18n keys to all six `lang.json` files, and uses the Problem / Fix / Testing PR body seen in #122 and #123. Estimates are focused developer days.

| # | PR | Scope | Tests | Est. |
| --- | --- | --- | --- | --- |
| 0 | Fix colour column type (done) | Entity `color?: string` as `text`; Postgres `smallint → text`; SQLite in-place column swap to `text`; destructive statements removed from the two v0.4.0 migrations; both snapshots; `UpdateGarmentDto.color` as string; unnecessary cast in `clone()` removed. | `test/smoke.spec.ts` creates a garment with two colours and asserts the show page lists both, so the Postgres CI job covers it; Migrator-level checks of fresh and upgraded histories on both databases. | 1 |
| 1 | Photo-first creation (done) | `photoPicker` and `maskEditor` partials (show.hbs uses them); form.hbs new mode multipart with the picker, Save id, `garment.id` branches; `ImportController` with `POST /wardrobe/import` save route; `GarmentService.create` accepts a pre-stored photo; `FileService.discard`; `wireUpPhotoInput` options; ownerId fix and comment fixes in `background-removal.js`; `File.mimetype` populated; `update()` now drains unselected file parts (uploading with the toggle off used to hit sharp with an empty stream). | Unit spec for the parts loop with a fake `req.parts()` generator (fields before files, empty `nobgPhoto` drained, unknown part drained, both pipelines started concurrently, discard on failure); controller spec for guard and ownership; `test/new-garment-photo.spec.ts` mirroring the camera-capture contract, then `setInputFiles` → Save → garment page with the photo, then a replacement upload with the toggle off. | 2 |
| 2 | Source link column | Entity, two migrations (`source_url`, `notes → text` on Postgres), two snapshots, form input in all modes, "Imported from" row on the show page, `?sourceUrl=` prefill, create/update/clone pass-through with URL validation. | Validator unit test; e2e asserts the link renders with `rel="noopener"`. | 1 |
| 3 | SSRF-safe fetch and configuration | `undici` dependency, `url-policy.ts`, `safe-fetch.ts`, Joi variables, throttler activation with `@SkipThrottle` on file routes, Origin check helper, view-context flags. No UI. | `url-policy.spec.ts`: schemes, userinfo, ports, every deny range, obfuscated literals, mapped IPv6; `safe-fetch.spec.ts` against a loopback `http.createServer`: redirect re-validation, hop cap, byte cap, timeout, blocked DNS answers via `jest.mock('dns')`. | 1.5 to 2 |
| 4 | Product extractor | `page-metadata.ts`, `product-draft.ts`, `shopify-products-json.ts`, `category-mapper.ts`, `color-mapper.ts`, `image-intake.ts`, `garment-prefill.ts`, trimmed fixtures (array-wrapped `ProductGroup`, single `Product`, `@graph`, OG-only, Shopify JSON, Akamai denial, `bm-verify` meta-refresh, direct image). No UI. | One spec per file; fixture expectations; pathological-input specs for the tokenizer. | 2 to 3 |
| 5 | Import from link | `POST /wardrobe/import/url` and candidate previews; form import box, alert, `data:` preview injection, candidates, six failure states, `htmx:responseError` listener, `hx-disabled-elt`, `?mode`/`?url` deep links; i18n keys; README Features bullet and Configuration rows; privacy copy amended in all six locales in this PR; `.env` commented examples. | `import.service.spec.ts` with mocked fetch and storage; controller spec asserting guard, throttle and Origin metadata; `test/url-import.spec.ts` against a loopback fixture site (skipped unless `IMPORT_ALLOW_PRIVATE_NETWORKS` is set; set in `playwright.config.ts` `webServer.env` and both CI env blocks so the Postgres job exercises colour prefill and long URLs); negative e2e for a private URL. | 2 to 3 |
| 6 | Colour suggestion from the cut-out | `suggestColorsFromBlob` and the `onNobg` hook; check boxes and dispatch `change`; badges. | Playwright test with a solid-colour PNG fixture; unit test for the HSL bucketing if extracted as a pure function. | 1 |
| 7 | Web Share Target | Manifest `share_target` and "Import from link" shortcut; `POST /wardrobe/import/share` dispatcher; README note on platform support. The destination selector moved to 7b: `ownerId` reaches the save route only through the query string, and htmx's `hx-boost` reads a form's `action` once when it boosts it, so no client-side rewrite can redirect the save — it needs the owner resolved from the request body instead, which is the same session-handling work 7b does. | Dispatcher unit test over `url`/`text`/`title` permutations; manifest shape spec; manual Android checklist in the PR body (WebAPK, manifest lag, cookie on POST). | 1 |
| 7b | Share stash and `returnTo` (done) | Workbox POST route stashing the payload in the Cache API and redirecting to `/wardrobe/new?mode=link&shared=<id>`; `returnTo` on the login redirect restricted to same-origin paths (and only for GETs, since a POST cannot be repeated by following a redirect); pending-import notice on the offline page; the destination selector as a real `ownerId` field placed above the photo, because a form is serialised in tree order and the owner is needed before the file is stored. `postLogin` answers `HX-Redirect` rather than a 302: the login form posts with htmx, which followed the old redirect inside the request and swapped the result into the form, so the browser never navigated. | Unit tests for the stash handler, the return path and the body-chosen destination; the worker route, the replay and the offline notice are manual, since `PWA_ENABLED` is false wherever tests run. | 1 |
| 8 | AI enrichment (approved as opt-in, default off) | `ai/` providers and factory, `POST /wardrobe/import/analyze`, Suggest button (owner-only in shared wardrobes), provider badge, `PRIVACY_AI_*` copy, README section, `PROJECT_LOG.md` entry recording the opt-in policy. | Provider specs with `jest.spyOn(globalThis, 'fetch')`; schema validation spec; controller spec for 404 when `none`; e2e that the button is absent when `none`. | 2 to 3 |

PR 0, 2, 3 and 4 are independent of each other. PR 1 needs nothing but benefits from PR 0 on Postgres. PR 5 needs 1, 2, 3 and 4. PR 6 needs 1. PR 7 needs 5. PR 8 needs 1 and can land any time after.

---

## 7. Testing strategy

- **Unit** (`src/**/*.spec.ts`, jest, `Test.createTestingModule`): pure functions tested directly; services with mocked `FileService` (by class token), repositories (`getRepositoryToken`), `ConfigService` and `dns` (`jest.mock('dns')`, mirroring the existing `jest.mock('fs')`). Fetch is injected through a provider token so specs never touch the network. Fixtures are trimmed to `<head>` plus JSON-LD, under 10 KB; the full-page captures gathered during research are not committed.
- **Controller**: guard, throttle and Origin-check metadata asserted with the `Reflect.getMetadata('__guards__', …)` pattern from `auth.controller.spec.ts`; `I18nContext` mocked as `{ t: (key) => key }`.
- **E2E** (Playwright, five browser projects, no env by default): the new-garment page keeps the camera contract (`#photoCaptureBtn` visible, `capture="environment"` on the hidden input, gallery input without `capture`, single select); photo-first ends on the show page with the saved toast and an `/file/nobg/` image; URL flow against a loopback fixture when the private-network flag is set, skipped otherwise; a private URL is rejected with the translated message; the existing `camera-capture.spec.ts` stays green after the partial extraction.
- **CI**: add the private-network flag to both smoke env blocks and run the import specs in the Postgres job, so the colour repair, `notes` widening and long `sourceUrl` are exercised where they currently break.
- **i18n**: a small spec asserting every English key exists in the other five files, fixing the current gaps in the same PR or filing them separately.

---

## 8. Decisions

All resolved on 2026-09-06 with the recommended option, on the basis that this fork is for personal self-hosting. The "why" column records the reasoning for anyone revisiting them.

| Decision | Decided | Why |
| --- | --- | --- |
| Where the review UI lives | The new-garment page itself, with a small `ImportController` inside `WardrobeModule` rendering `wardrobe/form` | No extra tap on a phone; one field template for all modes so future fields (#125) appear in import automatically; keeps `WardrobeController` from growing. |
| Hold the image client-side and save once, or persist on import | Client-held, single multipart save | Unanimous across the three design lenses; no draft garments, no orphans, unchanged background-removal pipeline. |
| `IMPORT_URL_ENABLED` default | `true` | Every existing flag defaults false, but this is a user-initiated fetch of a URL the user typed with no third party involved, and zero-config users should get the headline feature. Privacy copy is amended in the same PR; flipping is a one-line Joi change. |
| Activate the global throttler | Yes: 600/min per IP default, `@SkipThrottle` on file routes, IP tracker only | Idiomatic and fixes the inert login throttle. Document `trustProxy` for remote reverse proxies. |
| New dependencies | `undici` only. No HTML parser (tokenizer plus fixtures is adequate; `node-html-parser` documented as the upgrade if microdata is wanted). No AI SDK (raw fetch shared by both providers). | Smallest supply-chain surface for a privacy-first image; two of three judges recommended this. |
| Origin / `Sec-Fetch-Site` check on import POSTs | Yes, scoped to import routes | Cheap, localised, and the only protection on `AUTH_ENABLED=false` instances. App-wide CSRF is a separate decision. |
| Widen Postgres `notes` to text | Yes, in the `sourceUrl` migration | One extra line per driver; avoids truncating descriptions mid-sentence. |
| SQLite colour column in PR 0 | In-place column swap to `text` | DDL and snapshot agree and the next `migration:create` stays clean, without the table rebuild that cascade-deletes `outfit_garments`. |
| AI phase | Approved as opt-in, default off, provider-agnostic, `claude-opus-5` default with `claude-haiku-4-5` documented; button owner-only in shared wardrobes | Aligns with the privacy page and "no GPU needed" positioning; a `PROJECT_LOG.md` entry records the policy. If contributed upstream, the hosted instance stays at `none`. |
| Share target: ship with or without the service-worker stash | Plain server-handled POST first; stash and `returnTo` as the follow-up PR | Most PWA users hold a valid session; the follow-up closes the expired-session and offline gaps. |
| Mask editor after a link import | Keep the existing auto-open, with the `hasAlpha` skip | Consistency with uploads. One judge preferred an explicit "Edit mask" button instead; settled on 2026-09-10 in favour of the auto-open after using it, so the question is closed rather than deferred. |
| Where this design lives | This file | The fork's design record. `docs/DESIGN.md` lists import and auto-tagging as v0.2+ candidates and is otherwise stale since v0.1; upstream's rule 1 applies only if contributed back. |
| Category output | One string via `category-mapper.ts` | Isolated so #127 (hierarchy) or #130 (multiple categories) can replace it. |

---

## 9. Risks and mitigations

| Risk | Evidence | Mitigation |
| --- | --- | --- |
| Large retailers block server-side fetches | Probe of 24 product URLs from a datacenter IP: 11 hard-blocked with Chrome-like headers (Akamai at H&M, Uniqlo US, Levi's, eBay; Cloudflare challenges at Depop, Grailed, SSENSE; DataDome at Etsy), 15 with an honest bot user agent. Nike, Vinted, Zara, ASOS, Zalando, Farfetch and Shopify stores served real HTML. Residential IPs likely fare better. | Six distinct failure states with the URL kept and the camera one tap below; Shopify JSON shortcut; feature described as best-effort. |
| SSRF from inside the Docker network | Server fetches arbitrary URLs; compose services resolve to 172.x. | Connect-time guard, redirect re-validation, scheme and port allowlist, byte and time caps, no body relay, private ranges opt-in only. |
| Cross-site pages drive the outbound fetcher on auth-less instances | No session on `AUTH_ENABLED=false`. | Origin / `Sec-Fetch-Site` check on import POSTs; per-IP throttle. |
| Wrong variant picked on multi-variant pages | Nike exposes 39 variants; colour and image differ per variant. | Match variant by URL sku or colour, else group fields; alternative image buttons; Replace via the picker. |
| Heuristic misfires: khaki, teal, French gilet, "dress shirt", brands containing colour words | Language ambiguity. | Ordered exclusions, brand removed before colour matching, everything shown as editable and badged, category left empty rather than guessed. |
| Orphan `File` rows when the garment flush fails | `storeImageFromFileUpload` persists the row before the garment is flushed. | `FileService.discard` compensation in the save route. |
| Postgres `varchar(255)` overflows | Snapshot column types. | `notes` widened; `name`, `brand`, `size` truncated; `sourceUrl` is text. |
| Global throttler bites shared-IP deployments | `trustProxy` loopback-only; a grid fires many `/file` requests. | Generous default, `@SkipThrottle` on file routes, documented `trustProxy`. |
| Share payload lost on an expired session; no share target on iOS, Firefox or GMS-less Android | Guard 302 after POST drops the body; platform support. | Follow-up stash and `returnTo`; message as "Android and desktop Chromium". |
| Page reload after a link import loses the imported photo | Client-held state. | Fields and source link persist through the re-import; documented degradation. |
| AI phase sends photos off-server; open instances expose a paid endpoint | `AUTH_ENABLED=false` default. | Explicit button naming the host, owner-only in shared wardrobes, per-IP throttle, privacy copy, hosted instance stays off. |
| Tarpits tie up the event loop | 12 s+ holds observed. | 8 s header and body timeouts, 10 s total deadline. |
| Regex extraction over attacker-controlled HTML | Pathological inputs. | Linear patterns only, 3 MiB cap, pathological-input specs. |

---

## 10. Future extensions this design leaves room for

- **Bulk and CSV import (#126).** `ImportService.fromUrl` returns a `GarmentPrefill` plus image bytes independent of HTTP, and `GarmentService.createWithPhoto` is callable in a loop; a folder drop maps files to prefills in the browser and saves one per item. Server-side rows would add a `FileService.storeImageFromBuffer`, the only missing primitive. `sourceUrl` is a plain exportable column.
- **Categories (#127, #130).** All inference is isolated in `category-mapper.ts`, returning one string today; the AI schema keeps `category` (enum) and `category_suggestion` (free text) separate so a hierarchy can map the suggestion server-side.
- **Storage locations (#125).** Nothing location-related is written to `notes`; the form stays the single field template, so a new field appears in import automatically.
- **In-browser zero-shot classification.** MobileCLIP-S0 vision tower (11.8 MB int8 ONNX) via `@huggingface/transformers` with self-hosted weights, the same pattern as the background-removal models, and label embeddings precomputed at build time: category and pattern suggestions with no key and no data leaving the device, posting to the same analyze endpoint as provider `browser`.
- **Microdata reader** with `node-html-parser` if OG-only pages prove too thin.
- **Per-site adapters** registry, Shopify being the first.

---

## Appendix A. Heuristic maps (condensed)

Full multilingual lists live in `category-mapper.ts` and `color-mapper.ts`; the existing `CATEGORY_*` translations in the six `lang.json` files seed the non-English terms. Matching is whole-word on NFD-lowercased text, longest phrase first, exclusions first (`dress shirt`, `dress shoes`, `dress pants` are not dresses; `shirt dress` is; `top handle` is a bag; `denim jacket` is outerwear; jumpsuits map to a custom category if the user has one, else empty).

Category order: bags → footwear → accessories → outerwear → dresses → bottoms → tops.

| Category | English core | Other-language examples |
| --- | --- | --- |
| footwear | shoe, sneaker, trainer, boot, sandal, loafer, heel, pump, mule, slipper, clog, espadrille, oxford, brogue, moccasin | scarpe, stivali, sandali; chaussures, baskets, bottes; Schuhe, Stiefel, Sandalen; zapatos, zapatillas, botas; обувь, кроссовки, ботинки, сапоги |
| bags | bag, handbag, tote, backpack, crossbody, clutch, satchel, belt bag, duffel, pouch | borsa, zaino, tracolla; sac, sac à dos, pochette; Tasche, Rucksack, Umhängetasche; bolso, mochila, bandolera; сумка, рюкзак, клатч |
| outerwear | jacket, coat, parka, puffer, trench, raincoat, anorak, bomber, blazer, gilet (EN), poncho | giacca, cappotto, piumino; veste, manteau, doudoune (but FR *gilet* is a cardigan → tops); Jacke, Mantel, Daunenjacke; chaqueta, abrigo, plumífero; куртка, пальто, пуховик |
| dresses | dress, gown, sundress, slip dress, shirt dress, kaftan | vestito, abito; robe; Kleid; vestido; платье, сарафан |
| bottoms | pants, trousers, jeans, shorts, skirt, leggings, joggers, chinos, culottes, cargo | pantaloni, gonna; pantalon, jupe, short; Hose, Rock, Jeans; pantalón, vaqueros, falda; брюки, джинсы, юбка, шорты |
| tops | top, t-shirt, tee, shirt, blouse, sweater, jumper, hoodie, sweatshirt, cardigan, polo, tank, camisole, bodysuit, turtleneck | maglia, camicia, felpa; haut, chemise, pull, sweat; Oberteil, Hemd, Bluse, Pullover; camiseta, camisa, jersey, sudadera; футболка, рубашка, свитер, худи |
| accessories | hat, cap, beanie, scarf, belt, gloves, socks, tights, sunglasses, watch, jewellery, necklace, bracelet, earrings, ring, tie, wallet, headband | cappello, sciarpa, cintura; chapeau, écharpe, ceinture; Mütze, Schal, Gürtel; sombrero, bufanda, cinturón; шапка, шарф, ремень, очки |

Swimwear, underwear, activewear and lingerie words map to those categories only when the user already has them as custom categories; otherwise the field stays empty.

Colour synonyms (each maps to one `GarmentColor`; pattern words checked first; brand names containing colour words such as Off-White, Red Wing, Golden Goose, Silver Cross are removed before matching):

| Colour | Synonyms (EN plus IT/FR/DE/ES/RU heads) |
| --- | --- |
| red | crimson, scarlet, burgundy, bordeaux, maroon, wine, brick; rosso, rouge, rot, rojo, красный |
| pink | blush, fuchsia, magenta, salmon, coral; rosa, rosado, cipria, розовый |
| orange | tangerine, apricot, peach, rust, terracotta, copper; arancione, naranja, оранжевый |
| yellow | mustard, lemon, ochre, honey; giallo, jaune, gelb, amarillo, жёлтый |
| green | olive, khaki (default), sage, mint, emerald, forest, lime, teal (default); verde, vert, grün, зелёный, хаки |
| blue | navy, cobalt, royal, sky, indigo, denim, turquoise, petrol, midnight; blu, azzurro, bleu, marine, blau, azul, marino, синий, голубой |
| purple | violet, lilac, lavender, plum, mauve, aubergine; viola, lilla, lila, morado, фиолетовый |
| black | jet, onyx; nero, noir, schwarz, negro, чёрный |
| white | off-white, ivory, snow, chalk, eggshell; bianco, blanc, weiß, blanco, белый |
| grey | gray, charcoal, slate, heather, graphite, anthracite, marl; grigio, gris, grau, серый |
| beige | tan, camel, sand, stone, oatmeal, nude, taupe, ecru, cream, greige; sabbia, sable, creme, arena, бежевый |
| brown | chocolate, coffee, mocha, cognac, chestnut, tobacco, caramel; marrone, marron, braun, marrón, коричневый |
| gold | golden, brass, champagne; oro, or, dorado, золотой |
| silver | chrome, platinum, steel, metallic; argento, argent, silber, plata, серебряный |
| pattern | multicolour, print, floral, striped, plaid, check, tartan, gingham, houndstooth, polka dot, leopard, animal, camo, paisley, tie-dye, colour-block, graphic; fantasia, imprimé, gemustert, estampado, принт |

Unmapped colour words are kept as custom colours only when they came from an explicit colour field; otherwise they are dropped.

## Appendix B. Research notes

- Retailer probe (2026-09-05, datacenter egress): JSON-LD `Product` present on Nike (array-wrapped `ProductGroup` with 39 `hasVariant`), Vinted (single `Product` with brand, color, category, seller photo), Farfetch; absent on Uniqlo UK (name, image and brand from Open Graph only), COS, Allbirds; blocked at Zara (Akamai `bm-verify` page with HTTP 200), H&M, eBay, Depop, Grailed, Levi's.
- Web Almanac 2024: Open Graph on 64 % of pages, JSON-LD on 41 %, microdata `Product` (1.5 %) still more common than JSON-LD `Product` (0.77 %), which is why a microdata reader stays on the extension list.
- `node-html-parser` 9.0.3 parsed the 2 MB Vinted page in 14 ms and the 1 MB Nike page in 29 ms; cheerio took 181 ms and 76 ms; `open-graph-scraper` 267 ms and 128 ms and does not interpret JSON-LD.
- undici: `Agent({ connect })` accepts a connector function; a `lookup` inside `connect` reaches both `net.connect` and `tls.connect`; `redirect: 'manual'` returns the real 3xx with `Location`; Node skips `lookup` for literal IPs (bypass verified and closed by the connector wrapper). No maintained npm package provides SSRF-safe fetch for undici; undici issue #2019 and PR #5660 are still open.
- Anthropic vision: a 1024 px image is about 1369 tokens and a 1080 px image about 1521 (`ceil(w/28) × ceil(h/28)`); structured outputs support enums and `additionalProperties: false` but not `min`/`max`/`minLength`; refusals return schema-non-conforming output and must be handled.
- Ollama's OpenAI-compatible layer accepts `image_url` only as base64 `data:` URLs and passes `response_format.json_schema.schema` through as its native `format` (versions up to 0.6.2 ignored it, hence the `json_object` fallback).
- MobileCLIP-S0 vision tower is 11.8 MB int8 ONNX versus 89 MB for CLIP ViT-B/32; vision and text towers are separate files, so label embeddings can be precomputed and only the vision tower shipped.
- Handlebars escapes `=` inside attribute values as `&#x3D;`; the HTML parser decodes it, so client code must read `img.getAttribute('src')`, not the raw template text.
