# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-10-15

#### Added

- A new look on every page: Libre Closet's own mark, icons, palette and fonts (served by your instance), a header that stays in view, and a dock on phones that shows where you are
- Every page can be used from the keyboard, has labelled controls, and works in light and dark mode down to 320 px wide
- A privacy policy and terms of service written for a self-hosted instance, naming whoever runs it through the new `OPERATOR_NAME` and `OPERATOR_CONTACT` settings
- `SOURCE_URL` and `IMAGE_NAME` settings, so a modified copy can point its landing page and About at its own source code and image, as the AGPL asks
- A `THROTTLE_LIMIT` setting for the number of requests allowed per minute (600 by default, as before)
- Push notifications show their text and icon, and open the app when tapped
- New screenshots on the landing page and in the install dialog, taken from a demo wardrobe

#### Changed

- The app's text is in plain British English and sentence case, and the landing page and About make plainer claims
- Error pages, and sign-in and registration errors, say what went wrong in your language
- Wardrobe search and filters sit in the page, with a filter sheet you can use from the keyboard
- The password-reset email names the app instead of your email address
- Pages load faster: a smaller stylesheet, the first garment photo fetched first, and a landing page whose screenshots no longer hold up its first paint
- The offline app no longer stores the marketing screenshots, so it downloads about 0.4 MB instead of 1.3 MB
- `ICON_NAME` defaults to the new icon; a setting that names the old Lazztech icon falls back to it, with a warning in the log

#### Fixed

- A public share link no longer shows the owner's email address, on the page or in its link preview
- File links serve only files the app stored; any other name answers 404
- A share link to something that does not exist answers 404 instead of an empty page
- An error under a file link was cached by browsers for a year
- The link import box's field takes focus as soon as it opens, in Safari too

## [0.6.0] - 2026-09-10

#### Added

- Import a garment from a link: paste a product URL and the page's name, brand, colors, category, size options, description and photo are filled in for you to check
- Colors are suggested from the photo once its background has been removed, on a garment whose colors you have not chosen yourself
- Share a product page or a photo from another app straight into a new garment, where the installed app supports it
- A share that arrives with an expired session, or with no connection, is kept and offered again instead of being lost
- Choose which wardrobe to save into when a share did not say
- Optional AI suggestions for a garment's details, off by default and never automatic: when an administrator configures a provider, a button appears in your own wardrobe that names the host it would send the photo to
- Add a photo, with background removal, while creating a garment
- Record where a garment came from with a source link

#### Changed

- Complete the German, Spanish, French, Italian and Russian translations
- Photo controls respond immediately, and the background-removal models are downloaded only when you reach for them rather than on every page load
- Requests are now rate limited, which also activates the existing sign-in limits

#### Fixed

- Signing in now returns you to the page you were trying to reach, and leaves the address bar on that page rather than on the login form
- A request the server refused or rate limited failed silently, with nothing shown to the user
- Closing the background touch-up window left the Save button stuck on a new garment
- Garments could be created in another user's wardrobe when user accounts are disabled
- A photo upload that was rejected no longer leaves the image on the server
- Saving a garment with one or more colors failed on PostgreSQL
- Upgrading an older database no longer fails on PostgreSQL or removes garments from saved outfits on SQLite

## 0.5.0 - 2026-06-26

#### Added

- Garment color combination support
- Garment washing details
- Garment acquisition date
- Garment archival
- Garment cloning

#### Fixed

- Visual bug on outfit builder

## 0.4.1 - 2026-06-15

#### Fixed

- Fix DISABLE_REGISTRATION logic

## 0.4.0 - 2026-06-13

#### Added

- Wardrobe sharing from one user to another with either view only or edit permissions

## [0.3.2] - 2026-06-09

#### Added

- Background removal toggle for garment photo uploads

## [0.3.1] - 2026-05-26

#### Changed

- Server HttpAdapter to Fastify, resulting in nearly a 2x throughput increase and almost half the latency.

## [0.3.0] - 2026-05-21

#### Added

- Garment image background touch up tool

## [0.2.5] - 2026-05-1

#### Added

- Option to disable register functionality

## [0.2.4] - 2026-04-28

#### Fixed

- Fix garment photo upload cropping

## [0.2.3] - 2026-04-20

#### Added

- Russian language support

## [0.2.2] - 2026-04-17

#### Changed

- Garment and Outfit names now optional

## [0.2.1] - 2026-04-15

#### Fixed

- fix empty outfit click area

## [0.2.0] - 2026-04-10

#### Added

- Clueless inspired outfit builder
- Outfit Scheduling
- Image background removal (Client-side and Server-side)
- Customizable categories

## [0.1.9] - 2026-03-19

#### Fixed

- Rely on http cache layer for images from the file endpoint rather than the service worker
- Extended login validity and added token fingerprint for invalidation on password change

#### Changed

- Change garments query to order by descending order to show new items at the top
- Adjusted garment list sizing on mobile

## [0.1.8] - 2026-03-13

#### Fixed

- Safe area inset for search bar
- S3 file service streaming object handling and config

#### Added

- French, German, and Spanish language support

## [0.1.7] - 2026-03-07

#### Added

- Italian language support

## [0.1.6] - 2026-03-06

#### Added

- Garment search and filter

## [0.1.5] - 2026-03-05

#### Fixed

- Added missing postgresql migration

## [0.1.4] - 2026-03-03

#### Fixed

- Fixed service worker update causing black screen

## [0.1.3] - 2026-03-03

#### Added

- Added garment "lingerie" category

## [0.1.2] - 2026-03-02

#### Fixed

- Fixed images rotate 90 degrees when uploaded

## [0.1.1] - 2026-02-26

### Fixed

- Bug fix for sharing outfits or wardrobes
- Validation to prevent user from submitting image before one is selected

### Changed

- Button label from "copy text" to "share" for clarity

## [0.1.0] - 2026-02-25

### Added

- MVP functionality
