# Libre Closet

> Your wardrobe. Your data.

A free, open-source, self-hosted wardrobe organizer. Catalog your clothes, upload photos, build outfits, and access everything from your phone as an offline-ready PWA - all on your own server.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Join the Discussion](https://img.shields.io/badge/Community-Join%20the%20Discussion-2EA44F?logo=github&logoColor=white&labelColor=1F2937)](https://github.com/Lazztech/Libre-Closet/discussions)

Crafted and engineered with care and intention by [Lazztech LLC](https://lazz.tech/about) 🖤

---

## About this fork

This is a personal fork of [lazztech/Libre-Closet](https://github.com/Lazztech/Libre-Closet). It adds importing a garment from a product link, sharing a page or photo into the app, colour suggestion from the cut-out photo, and optional AI suggestions from a model you choose — none of which are upstream.

**Upstream's published images do not contain this code** — `ghcr.io/lazztech/libre-closet` and `lazztech/libre-closet` on Docker Hub are built from upstream. This fork publishes its own image to `ghcr.io/demo-hub/libre-closet` instead, which is what everything below pulls.

---

## News

**`v0.4.0` Wardrobe Sharing - June 13, 2026**

You can now share your Libre Closet wardrobe with your friends, or for the stylists out there, you may now use this tool to manage your client's wardrobes!

To share your wardrobe, navigate to your profile (either through the hamburger menu on mobile, or the navbar on desktop), click on "Wardrobe Sharing", then click "Create Invite Link", copy the link and send it to your friend. Have them do the same if you would like to share both ways.

Or from the same wardrobe sharing page, if you would like grant someone else permissions to manage your wardrobe then select the permission drop down and choose "Can edit", copy the invite link, and send it to your stylist friends.

**`v0.3.1` Significant Performance Improvements - May 26, 2026**

Libre Closet is now more performant, making more efficient use of your existing hardware!

We've [refactored the server](https://github.com/Lazztech/Libre-Closet/pull/79) resulting in nearly a 2x throughput increase, almost half the latency, and the lighthouse speed score has gone from [68/100](https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/1779424001828-3096.report.html) to [99/100](https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/1779843850519-27579.report.html).

| Metric       | Before       | After        | Change      |
| ------------ | ------------ | ------------ | ----------- |
| Requests/sec | 1,188.10     | 2,091.64     | **+76.05%** |
| Latency avg  | 7.90 ms      | 4.24 ms      | **–46.33%** |
| Latency p50  | 7.00 ms      | 4.00 ms      | **–42.86%** |
| Latency p99  | 18.00 ms     | 11.00 ms     | **–38.89%** |
| Throughput   | 26.39 MB/sec | 44.30 MB/sec | **+67.87%** |

#### Release

- `v0.5.0 - June 26, 2026`: Added garment color combination support, washing details, acquisition date, archival, and cloning
- `v0.4.1 - June 15, 2026`: Fixed disable register functionality
- `v0.4.0 - June 13, 2026`: Added wardrobe sharing from one user to another with either view only or edit permissions
- `v0.3.2 - June 09, 2026`: Added background removal toggle for garment image uploads.
- `v0.3.1 - May 26, 2026`: Refactored server resulting in nearly a 2x throughput increase and almost half the latency.

For full details refer to the [CHANGELOG](CHANGELOG.md).

---

## Quick start

```bash
docker run -d \
  -p 3000:3000 \
  -v librecloset_data:/app/data \
  ghcr.io/demo-hub/libre-closet
```

If the pull fails with `denied` or `unauthorized`, the GHCR package is still private: make it public once under the package's settings on GitHub, or `docker login ghcr.io` with a token that has `read:packages` — see [Publishing a new image](#publishing-a-new-image).

Open [http://localhost:3000](http://localhost:3000). No account required by default. The database is created and migrated on first boot; there is no separate setup step.

**Want to see the upstream project without building anything?** A public instance runs at [https://librecloset.lazz.tech](https://librecloset.lazz.tech). Note that it is upstream, so it has none of this fork's import or AI features.

---

## Screenshots

Note, these screenshots are taken of the web application viewed as an installed standalone PWA. This tool may also be used like a traditional web app in the browser.

| Wardrobe (Mobile)                                                    | Outfits (Mobile)                                               | Outfit Schedule (Mobile)                                               | Outfit Builder (Mobile)                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| ![Wardrobe grid](public/assets/screenshots/Screenshot_mobile_1.webp) | ![Outfits](public/assets/screenshots/Screenshot_mobile_2.webp) | ![Outfit Schedule](public/assets/screenshots/Screenshot_mobile_3.webp) | ![Outfit ](public/assets/screenshots/Screenshot_mobile_4.webp) |

| Wardrobe (Desktop)                                            | Outfits (Desktop)                                       | Outfit Schedule (Desktop)                                       | Outfit Builder (Desktop)                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| ![Wardrobe grid](public/assets/screenshots/Screenshot_1.webp) | ![Outfits](public/assets/screenshots/Screenshot_2.webp) | ![Outfit Schedule](public/assets/screenshots/Screenshot_3.webp) | ![Outfit detail](public/assets/screenshots/Screenshot_4.webp) |

---

## Optional AI suggestions

Off by default. With `AI_PROVIDER` unset or `none` the feature does not exist: no button, no code path, nothing configured to talk to.

When an administrator does configure a provider, a **Suggest details** button appears on the new-garment page, labelled with the host it would talk to. Pressing it is the consent — nothing is sent before that, and nothing is sent automatically, ever.

**What leaves the server when you press it:** one downscaled JPEG of the garment, the language the UI is set to, and the names of the categories your wardrobe already uses. **What never does:** a photo of any other garment, an outfit, your account, or anything else on the page.

The button is your own wardrobe only. In a wardrobe someone shared with you it is absent, and the route refuses the request even if you construct one by hand: a share lets you add garments, not decide that its owner's category names may leave this server.

Everything the model answers is checked before it is shown — colours and categories against the values the app actually has, confidence clamped, markup and links stripped, lengths cut to what the columns hold — and every suggestion is a button you tap to apply, never a field filled in for you.

### With a local model (nothing leaves your network)

Running the app directly on the same machine as Ollama, two settings are enough, because the address is assumed:

```env
AI_PROVIDER=ollama
AI_MODEL=qwen2.5vl:7b
```

**In Docker it is three, and the third is not optional.** The assumed address is `http://127.0.0.1:11434/v1`, which inside a container means the container itself — so the button appears, names `127.0.0.1:11434`, and never returns anything. See [Ollama from a container](#ollama-from-a-container) below.

The model has to be one that can see — `qwen2.5vl`, `llama3.2-vision`, `llava`, `gemma3` and friends. A text-only model will accept the photo, ignore it, and answer about nothing. Install Ollama first if you have not ([ollama.com/download](https://ollama.com/download), or `curl -fsSL https://ollama.com/install.sh | sh` on Linux), then `ollama pull qwen2.5vl:7b`.

**Picking one.** This is short structured extraction from a single photo, not reasoning, so model size matters far less than fitting on the hardware. What decides it is VRAM:

| VRAM | A reasonable choice | What to expect |
| --- | --- | --- |
| 6 GB or less | `qwen2.5vl:3b` | fits on the card; seconds per photo; thinner suggestions |
| 8 to 12 GB | `qwen2.5vl:7b` | the sweet spot for this task |
| 24 GB or more | `qwen2.5vl:32b` | better at reading a logo; overkill otherwise |
| No GPU | `qwen2.5vl:3b` and `AI_TIMEOUT_MS=120000` | a minute or more per photo |

A model that does not fit is split across GPU and CPU rather than refused, which reads as the feature being slow rather than as a configuration mistake. Watch for a `-vl`/`-vision` tag in the name: plain `qwen3` or `qwen2.5` cannot see, and will accept the photo and ignore it.

### Ollama from a container

Two things have to be true, and each fails silently on its own.

**The container has to be able to reach the host.** On Linux, `host.docker.internal` does not resolve unless you add it. Under your service in `compose.yml` (the complete file is in [docker compose](#docker-compose)):

```yaml
extra_hosts:
  - 'host.docker.internal:host-gateway'
environment:
  AI_PROVIDER: 'ollama'
  AI_BASE_URL: 'http://host.docker.internal:11434/v1'
  AI_MODEL: 'qwen2.5vl:7b'
```

**And Ollama has to be listening for it.** Ollama binds `127.0.0.1` by default, so a perfectly configured container still gets connection-refused:

```bash
sudo systemctl edit ollama.service
#   [Service]
#   Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

Ollama somewhere else entirely, or llama.cpp / vLLM / LM Studio instead, is the same thing with a different address:

```env
AI_PROVIDER=openai
AI_BASE_URL=http://192.168.1.5:11434/v1
AI_MODEL=qwen2.5vl:7b
```

That host is trusted and deliberately exempt from the import fetcher's private-address rules — reaching a machine on your LAN is the entire point. `IMPORT_ALLOW_PRIVATE_NETWORKS` is unrelated and does not need to be set; it only loosens the pasted-link importer.

`AI_BASE_URL` must end in `/v1`. The code appends `/chat/completions` to it and never adds `/v1` itself, so leaving it off gives a 404 that looks exactly like a model you forgot to pull.

### When it does not work

Two mistakes stop the container at boot, which is the good kind — you will see them:

```
Error: Config validation error: "AI_MODEL" is required
Error: Vapid subject is not an https: or mailto: URL. http://192.168.1.10:3000
```

The first is `AI_PROVIDER=ollama` or `openai` with no `AI_MODEL`. The second is unrelated to AI: see `SITE_URL` in [Configuration](#configuration).

The rest fail almost quietly. A server that answers with an HTTP error logs one line — `enrichment refused: HTTP 404` — but **a server the app cannot reach at all produces no log line**, because the connection error is logged at `debug` while the log transports sit at `info`. A timeout is silent for the same reason, and so is an answer that was not JSON. So a yellow "no suggestions" banner with nothing in the log means only that the request never produced usable JSON; it cannot tell an unreachable server from a model that answered prose. The probe below can. The button appearing proves nothing either: it renders whenever the URL and model are non-empty, and never dials the server. Check the link directly before suspecting the app:

```bash
docker compose exec libre-closet node -e "fetch('http://host.docker.internal:11434/v1/models').then(r=>r.json()).then(d=>console.log('OK',d.data?.length)).catch(e=>console.log('FAIL',e.cause?.code||e.message))"
```

Print `e.cause?.code`, not `e.message` — every failure reads as `fetch failed` otherwise.

Two things to expect from a local model. On CPU a vision model can take a minute or more, so raise `AI_TIMEOUT_MS` (30000 by default) — a timeout is silent and looks identical to an unreachable server. And smaller models ignore the response schema more often than hosted ones, which shows up as a suggestion with fewer fields rather than as an error, because everything is checked against the app's own values before you see it. Brand is the field small models get wrong most, and a brand the model was not confident about is dropped rather than shown — so seeing it rarely is the design, not a fault. The button is limited to 10 presses per 10 minutes.

### Cost

Per garment, roughly: **free** on a local model, about **$0.0035** on `claude-haiku-4-5`, about **$0.017** on `claude-opus-5`.

## Features

- **Garment catalog** - name, category, brand, size, colors, notes, photo
- **Import from a link** - paste a product URL and the server reads the page for its name, brand, colors, category and photo, for you to check before saving
- **Share to the app** - share a product page or a photo from any app straight into a new garment (Android and desktop Chromium; iOS Safari and Firefox do not support share targets, so paste and camera remain the universal route)
- **Customizable categories** - custom category support with filtering and input suggestion as you type
- **Outfit builder** - combine garments into saved looks with the Clueless inspired outfit builder
- **Outfit Scheduling** - schedule out multiple outfits for given days through the week and get a view of what you've worn
- **Image Background Removal** - Images automatically have their backgrounds removed and optimized WebP upon upload
- **Color suggestion** - once the background is gone, the garment's colors are read from the photo in your browser and ticked for you to confirm
- **Optional AI suggestions** - off by default; when configured, one tap asks a model you chose (including one on your own network) what the photo shows
- **Offline-ready PWA** - install to home screen, works without internet
- **Optional auth** - run open for personal use or enable JWT accounts for multi-user
- **S3 or local storage** - local disk by default, swap to any S3-compatible provider
- **SQLite or PostgreSQL** - SQLite by default, PostgreSQL for scale
- **Multi-language** - UI available in English, Italian, French, Russian, German, and Spanish

---

## Self-hosting

The server pulls a prebuilt image; it needs Docker and nothing else. No clone, no toolchain, no build.

### Docker (recommended)

```bash
docker run -d \
  -p 3000:3000 \
  -v librecloset_data:/app/data \
  ghcr.io/demo-hub/libre-closet
```

### docker compose

Save this as `compose.yml` anywhere on the server, then `docker compose up -d`.

```yaml
services:
  libre-closet:
    image: ghcr.io/demo-hub/libre-closet
    ports:
      - '3000:3000'
    volumes:
      - librecloset_data:/app/data
    # Linux does not resolve host.docker.internal without this
    extra_hosts:
      - 'host.docker.internal:host-gateway'
    environment:
      AUTH_ENABLED: 'false'
      # Your own address. Left unset it defaults to upstream's public instance,
      # so every share link you copy points at a server that is not yours.
      # It must be https:// — an http:// value stops the app at boot.
      SITE_URL: 'https://closet.example.com'
      # Optional AI suggestions. Uncomment all four once Ollama is actually
      # reachable from the container — see "Ollama from a container".
      #AI_PROVIDER: 'ollama'
      #AI_BASE_URL: 'http://host.docker.internal:11434/v1'
      #AI_MODEL: 'qwen2.5vl:7b'
      #AI_TIMEOUT_MS: '120000'
    restart: unless-stopped
    logging:
      driver: json-file
      options: { max-size: '10m', max-file: '3' }

volumes:
  librecloset_data:
```

`PWA_ENABLED` is deliberately absent: the service worker needs a secure context, so setting it on a plain-HTTP deployment does nothing at all, silently. Turn it on once you have HTTPS — see [Behind a reverse proxy](#behind-a-reverse-proxy).

Note that compose namespaces the volume as `<project>_librecloset_data`, where the project is the directory name lowercased with anything outside `a-z0-9_-` stripped — `Libre-Closet/` gives `libre-closet_librecloset_data`. That matters when you back it up; `docker compose config --format json` prints the real name.

Upgrading is `docker compose pull && docker compose up -d`. Migrations apply themselves on the new container's first boot, so back up first — see [Backups](#backups).

### Publishing a new image

CI builds and pushes to GHCR for `linux/amd64` and `linux/arm64` on any `v*` tag. The arm64 leg is emulated on GitHub's x86 runners, so a full two-platform run takes around 15 minutes. A tag push is also the only thing that produces the rolling `0.6` and `0` tags — `type=semver` reads a tag ref and is inert on a branch — so a `gh workflow run` on a branch publishes just the one version string you name plus `sha-<commit>`.

```bash
git tag v0.6.0 && git push origin v0.6.0
```

A release branch is meant to do this for you: merging a PR from `release/0.6.0` into `main` triggers `tag-release.yml`, which creates the tag and dispatches the publish. This path has not been exercised in this fork yet — check that the tag landed on the commit you expected before trusting the image it produces.

To build a commit without cutting a release:

```bash
gh workflow run docker-publish.yml --ref <your-branch> -f version=0.6.0-rc1
```

`--ref` is not optional: without it `gh` runs the workflow against the remote's default branch, so you get a build of `main` rather than of the commit you are on.

**Naming a version also moves `:latest`** onto that build, prerelease strings included — the enable expression is `startsWith(github.ref, 'refs/tags/v') || inputs.version != ''`, and the second half fires on any dispatch that names a version. So this command repoints the tag the Quick start `docker run` pulls at an unreleased branch commit. Running it with no `version` publishes **only** a `sha-<commit>` tag and leaves `:latest` alone; if you just want a pullable one-off, do that and pull the `sha-` tag by its full name.

A GHCR package is **private on first publish**. Either make it public once, under the package's settings on GitHub, or authenticate the server with a personal access token that has `read:packages`:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin
```

### Build from source

For development, or to run without Docker at all.

```bash
git clone https://github.com/demo-hub/Libre-Closet.git
cd Libre-Closet
npm install
npm run build          # start:prod runs dist/main, which this creates
npm run start:prod
```

Configure this route with a `.env.local` (gitignored) or real environment variables. **A `.env.local` does not work under Docker** — the image copies only the committed `.env`, so pass real environment variables there instead.

Building the image by hand, rather than letting CI do it, is `docker build -f docker/Dockerfile -t libre-closet .` from the repository root. It produces a ~1.9 GB image and takes several minutes — it runs `npm ci` twice and pulls a large model tarball, so do not assume it has hung, and needs outbound access to Docker Hub (for the `node:22` base images), to `registry.npmjs.org`, and to `staticimgly.com`, where the background-removal data is pinned. There is no `.dockerignore`, so build from a fresh clone rather than a working directory carrying `node_modules` and `data/`.

---

## Configuration

`.env` contains committed defaults, and it is baked into the Docker image. Override any value with a `.env.local` file (gitignored) when running from source, or with real environment variables — which win over both, and are the only way that works under Docker.

| Variable                           | Description                                    | Default        | Example                                                                                   |
| ---------------------------------- | ---------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `APP_NAME`                         | Display name shown in the UI and navbar        | `Libre Closet` | `My awesome Closet manager`                                                               |
| `DATA_PATH`                        | Directory for SQLite DB and uploaded files     | `./data`       | `./libre-closet-data`                                                                     |
| `AUTH_ENABLED`                     | Enable JWT user accounts and login. With `false`, everyone reaching the port shares one wardrobe with full write access | `false` | `true`                                             |
| `DISABLE_REGISTRATION`             | Disallows user sign ups when true              | `false`        | `true`                                                                                    |
| `PWA_ENABLED`                      | Enable service worker and PWA install prompt   | `false`        | `true`                                                                                    |
| `IMPORT_URL_ENABLED`               | Allow importing a garment from a pasted link   | `true`         | `false`                                                                                   |
| `IMPORT_URL_RATE_LIMIT`            | Link imports allowed per minute, per address   | `10`           | `60`                                                                                      |
| `AI_PROVIDER`                      | Optional AI suggestions: `none`, `ollama`, `openai` or `anthropic` | `none` | `ollama`                                                            |
| `AI_MODEL`                         | Model to ask. Required for `ollama` and `openai` — the app exits at boot without it | `claude-opus-5` (anthropic) | `qwen2.5vl:7b`                            |
| `AI_BASE_URL`                      | OpenAI-compatible endpoint, including the `/v1`. Defaults to Ollama's own address, which inside a container is the container | `http://127.0.0.1:11434/v1` (ollama) | `http://host.docker.internal:11434/v1` |
| `AI_API_KEY`                       | API key, where the provider wants one          | -              | `sk-ant-...`                                                                              |
| `AI_TIMEOUT_MS`                    | How long to wait for a suggestion              | `30000`        | `120000`                                                                                  |
| `IMPORT_ALLOW_PRIVATE_NETWORKS`    | Development and testing only - let the importer reach private and loopback addresses on any port | `false` | `true`                                                          |
| `IMPORT_FETCH_TIMEOUT_MS`          | Time budget for fetching a pasted link         | `10000`        | `20000`                                                                                   |
| `SITE_URL`                         | Public address, used for share links and page metadata. **Must be `https://` — an `http://` value stops the app at boot** | `https://librecloset.lazz.tech` | `https://closet.example.com`             |
| `ACCESS_TOKEN_SECRET`              | JWT signing secret - **change for production**, nothing enforces it | `ChangeMe!`    | `u9n8c2y847rfctb23468tcb689f243`                                       |
| `DATABASE_TYPE`                    | `sqlite` or `postgres`                         | `sqlite`       | `postgres`                                                                                |
| `DATABASE_HOST`                    | Postgres host                                  | -              | `192.168.10.5`                                                                            |
| `DATABASE_PORT`                    | Postgres port                                  | `5432`         | `9867`                                                                                    |
| `DATABASE_USER`                    | Postgres user                                  | -              | `postgres`                                                                                |
| `DATABASE_PASS`                    | Postgres password                              | -              | `7yfhcn2349cr32f`                                                                         |
| `DATABASE_SCHEMA`                  | Postgres schema. **Required when `DATABASE_TYPE=postgres`** — there is no default | -              | `libre-closet-schema`                                                                     |
| `DATABASE_SSL`                     | Use SSL for Postgres                           | `false`        | `true`                                                                                    |
| `FILE_STORAGE_TYPE`                | `local` or `object` (S3)                       | `local`        | `object`                                                                                  |
| `OBJECT_STORAGE_ACCESS_KEY_ID`     | S3 access key                                  | -              | `AKIAIOSFODNN7EXAMPLE`                                                                    |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | S3 secret key                                  | -              | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`                                                |
| `OBJECT_STORAGE_ENDPOINT`          | S3-compatible endpoint URL                     | -              | `https://s3.example.com:8443`                                                             |
| `OBJECT_STORAGE_REGION`            | S3 region                                      | `us-east-1`    | `us-west-1`                                                                               |
| `OBJECT_STORAGE_BUCKET_NAME`       | S3 bucket name                                 | `libre-closet` | `my-awesome-closet-manager-bucket`                                                        |
| `EMAIL_FROM_ADDRESS`               | From address for password reset emails         | -              | `LibreCloset@example.com`                                                                 |
| `EMAIL_TRANSPORT`                  | `gmail` or `mailgun`                           | `gmail`        | `mailgun`                                                                                 |
| `EMAIL_API_KEY`                    | Mailgun API key                                | -              | `fyhn2437cryb248cbrdc32`                                                                  |
| `PUBLIC_VAPID_KEY`                 | Web push - generate for production. A shared default ships in `.env` | (committed default) | `BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U` |
| `PRIVATE_VAPID_KEY`                | Web push - generate for production. A shared default ships in `.env` | (committed default) | `UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls`                                 |

Generate JWT secret:

```bash
openssl rand -base64 60
```

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

---

## Development

### Prerequisites

- Node (see `.nvmrc`) - install via [nvm](https://github.com/nvm-sh/nvm)
- Docker (optional, for Postgres testing)

```bash
nvm install && nvm use
npm install
cp .env .env.local     # override defaults locally (gitignored)
npm run start:dev
```

### Scripts

```bash
npm run start:dev       # watch mode
npm run start:prod      # production
npm run test            # unit tests
npm run test:e2e        # Playwright end-to-end
npm run test:cov        # coverage
npm run precommit       # lint + test + lighthouse (run before committing)
```

### Migrations

Pending migrations are applied automatically on every boot, so deploying an upgrade needs no migration step — but a failing migration aborts startup, so back up before upgrading rather than after.

The commands below *author* a new migration during development; they are not part of deploying.

```bash
# SQLite (build first due to config differences)
npm run build
npx mikro-orm migration:create --config mikro-orm.sqlite.cli-config.ts

# PostgreSQL
npx mikro-orm migration:create --config mikro-orm.postgres.cli-config.ts
```

Never author a SQLite migration that rebuilds the `garment` table: `outfit_garments` carries `on delete cascade`, so the rebuild silently empties every saved outfit. Use add column / update / drop column / rename column instead.

### Docker build

```bash
# Build image
docker build --no-cache -f docker/Dockerfile . -t libre-closet:latest

# Cross-compile for linux/amd64 (e.g. building on Apple Silicon for a VPS)
docker buildx build --platform linux/amd64 --no-cache -f docker/Dockerfile . -t libre-closet:latest
```

---

## Backups

Everything that matters is one directory — `DATA_PATH` holds the SQLite database, every uploaded photo, and an `app.log` that nothing rotates. Back the database and the photos up together: restoring one without the other gives you garment pages whose images 404.

SQLite runs in WAL mode and the app never closes the connection cleanly, so **copying `sqlite3.db` on its own can restore as a database with no tables.** Stop the app and take the whole directory:

```bash
docker compose stop
docker run --rm \
  --volumes-from "$(docker compose ps -aq libre-closet)" \
  -v "$PWD":/out alpine \
  tar czf /out/closet-backup.tgz -C /app/data .
docker compose start
```

Do not spell the volume name by hand. Compose namespaces it as `<project>_librecloset_data`, and the project is the directory name **lowercased, with anything outside `a-z0-9_-` stripped** — the `Libre-Closet` directory the clone above creates gives `libre-closet_librecloset_data`, not `Libre-Closet_librecloset_data`. A name that does not match silently creates and archives a new empty volume instead, and you only find out at restore time. `docker compose config --format json` prints the real name if you want to check it.

---

## HTTPS with Tailscale

The least work by a distance, and the option that also solves access control. Verified against Tailscale 1.102.

```bash
sudo tailscale serve --bg 3000
tailscale serve status          # prints your https://<host>.<tailnet>.ts.net URL
```

Tailscale terminates TLS with a real certificate for your machine's tailnet name and proxies to `127.0.0.1:3000`. Nothing to renew, nothing to install on your phone.

Type the `https://` — `serve` listens on 443 only, so `http://` gets no answer and no redirect, which looks like the server being down. It is a first-visit problem: the app sends a year-long HSTS header, so after one successful load the browser upgrades `http://` on its own, and once you add the app to your home screen there is no address to type at all.

**One prerequisite that is not obvious:** HTTPS certificates must be enabled for the tailnet first — admin console, Settings, DNS, enable MagicDNS and then HTTPS Certificates. It is a one-time switch per tailnet, and without it `serve` fails outright rather than falling back to something.

Then two changes to the compose file:

```yaml
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      SITE_URL: 'https://your-server.your-tailnet.ts.net'
      PWA_ENABLED: 'true'
```

`127.0.0.1:3000:3000` rather than `3000:3000` is the one worth taking deliberately. The app binds `0.0.0.0` unconditionally and there is no host or bind variable, so with the usual mapping anyone on your LAN can reach it — and with `AUTH_ENABLED=false` that is full read and write on your wardrobe. Publishing to loopback leaves the tailnet as the only route in, which is what makes running without accounts an honest choice rather than a gamble. `tailscale serve` proxies to `127.0.0.1:3000`, so it still reaches the app.

`PWA_ENABLED` matters because HTTPS alone does not give you the PWA: the service worker is gated on the flag as well, and it defaults to false.

What stays imperfect: `og:image` on a shared link still says `http://`, because the app trusts forwarded headers from loopback only and Tailscale connects from elsewhere. That affects how a link previews in a chat app, nothing in normal use — and with `AUTH_ENABLED=false` the sharing routes do not exist anyway. Garment photos are unaffected: every rendered `<img>` uses a relative `/file/...` path, so there is no mixed content to block.

---

## Behind a reverse proxy

Only if you are not using the section above. The app trusts forwarded headers from loopback only, which no container deployment satisfies — a proxy in another container connects from the bridge network. Left alone, per-address rate limiting collapses into a single shared bucket, and generated share links come out with the wrong scheme. There is no setting for this: the trusted list is hardcoded at `src/main.ts:20` and no environment variable overrides it. The published image ships only `dist/`, so changing it means building your own — clone the repo, widen `trustProxy` to the address your proxy connects from (`'172.16.0.0/12'` covers the default Docker bridge ranges), and `docker build -f docker/Dockerfile -t libre-closet .`. Until you do, expect the shared rate-limit bucket and the wrong-scheme share links described above.

Two proxy defaults will bite regardless:

- **Body size.** The app accepts garment photo uploads up to 100 MB (15 MB applies only to the AI-analyze and share-target routes); nginx defaults to 1 MB and rejects real phone photos with a 413 before the request reaches the app. Set `client_max_body_size 25m;`, or whatever ceiling you have chosen on purpose — just make it a number you picked, not nginx's 1 MB default.
- **Read timeout.** nginx defaults to 60 s, which cuts off a slow local vision model even when `AI_TIMEOUT_MS` allows longer. Raise `proxy_read_timeout` above your `AI_TIMEOUT_MS`.

Use `$http_host` rather than `$host` when setting the forwarded host, so a non-standard external port survives into the links the app generates.

HTTPS plus `PWA_ENABLED=true` is what unlocks the PWA layer — install to home screen, offline, and sharing into the app from another app — because service workers require a secure context and the app only registers one when the flag is on. Either one alone leaves those features absent, with no error anywhere. Note that `localhost` counts as a secure context, so testing on the server itself looks like it works while the same build fails on your phone.

---

## Deployment recommendations

For most self-hosters: a small VPS or a machine on your own network, built from the compose file above with SQLite + local storage. SQLite handles thousands of users without issue - see [DjangoCon 2023: Use SQLite in Production](https://youtu.be/yTicYJDT1zE).

With `AUTH_ENABLED=false` there is no access control of any kind, so keep such an instance on a private network. [HTTPS with Tailscale](#https-with-tailscale) is the least work and covers both concerns at once — a bare tailnet address is still plain HTTP, so `tailscale serve` plus `PWA_ENABLED=true` is what actually gets you the PWA. If you would rather expose it publicly, turn `AUTH_ENABLED` on **before** adding any garments: with auth off every garment is stored unowned, and enabling it afterwards leaves the existing wardrobe orphaned and invisible to your new account. Set a real `ACCESS_TOKEN_SECRET` and `DISABLE_REGISTRATION=true` at the same time.

If you need horizontal scaling later, switch to S3-compatible storage and consider a PostgreSQL migration. [Litestream](https://litestream.io/) can stream the SQLite file offsite, but it replicates only the database — your photos still need backing up separately.

---

## Contributing

PRs and issues are welcome. This project is licensed under AGPL-3.0 - contributions must be compatible with that license.

---

## License

[GNU AGPL-3.0](LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=Lazztech/Libre-Closet&type=date&legend=top-left)](https://www.star-history.com/?repos=Lazztech%2FLibre-Closet&type=date&legend=top-left)
