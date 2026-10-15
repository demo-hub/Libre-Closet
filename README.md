# Libre Closet

> Your wardrobe. Your data.

A free, open-source, self-hosted wardrobe organizer. Catalog your clothes, upload photos, build outfits, and use it from your phone as an offline-ready PWA - all on your own server.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

This is a fork of [lazztech/Libre-Closet](https://github.com/Lazztech/Libre-Closet). It adds importing a garment from a product link, sharing a page or photo into the app, colour suggestion from the photo, and optional AI suggestions. Upstream's published images do not contain this code; this fork publishes its own at `ghcr.io/demo-hub/libre-closet`.

![The wardrobe on a phone](public/assets/screenshots/Screenshot_mobile_1.webp)

## Features

- **Garment catalog** - name, category, brand, size, colors, notes, photo
- **Import from a link** - paste a product URL and review what the server reads from it
- **Share to the app** - share a page or photo straight into a new garment (Android and desktop Chromium)
- **Outfit builder and scheduling** - save looks and plan what to wear each day
- **Background removal** - uploads are cut out and optimized to WebP, and colors are suggested from the result
- **Optional AI suggestions** - off by default; one tap asks a model you choose, including one on your own network
- **Offline-ready PWA** - install to your home screen
- **Optional accounts** - run open for personal use, or enable JWT accounts and wardrobe sharing
- **Storage** - SQLite or PostgreSQL; local disk or any S3-compatible provider
- **Languages** - English, Italian, French, Russian, German, Spanish

## Quick start

```bash
docker run -d \
  -p 3000:3000 \
  -v librecloset_data:/app/data \
  ghcr.io/demo-hub/libre-closet
```

Open [http://localhost:3000](http://localhost:3000). No account is required by default, and the database is created on first boot.

## Self-hosting

For anything you keep running, use compose. Save this as `compose.yml` and run `docker compose up -d`:

```yaml
services:
  libre-closet:
    image: ghcr.io/demo-hub/libre-closet
    ports:
      # With AUTH_ENABLED=false this exposes read/write access to your whole LAN.
      # Use '127.0.0.1:3000:3000' if you front it with Tailscale or a proxy.
      - '3000:3000'
    volumes:
      - librecloset_data:/app/data
    environment:
      AUTH_ENABLED: 'false'
      # https:// only; an http:// value stops the app at boot.
      SITE_URL: 'https://closet.example.com'
    restart: unless-stopped

volumes:
  librecloset_data:
```

- **Upgrade:** `docker compose pull && docker compose up -d`. Migrations run on boot, so back up first.
- **HTTPS and the PWA:** service workers need a secure context. Once you have HTTPS, set `PWA_ENABLED: 'true'`. The easiest route is `sudo tailscale serve --bg 3000`, which gives you a real certificate on your tailnet. First enable MagicDNS and HTTPS Certificates on the [DNS page of the admin console](https://console.tailscale.com/admin/dns), or `serve` waits on that switch and looks hung. It listens on 443 only, so type the `https://` address that `tailscale serve status` prints.
- **Reverse proxy:** the app trusts forwarded headers from loopback only. Behind a containerized proxy, rate limiting shares one bucket and `/share` previews say `http://`. Set nginx `client_max_body_size 25m` (uploads can be large) and a `proxy_read_timeout` above `AI_TIMEOUT_MS`.
- **Access control:** with `AUTH_ENABLED=false` everyone who reaches the port shares one wardrobe with full write access. If you expose it publicly, enable auth *before* adding garments (existing ones are left unowned), and register your account *before* setting `DISABLE_REGISTRATION=true`.
- **Backups:** everything lives in `DATA_PATH`. Stop the app and archive the whole directory; copying `sqlite3.db` alone can restore as an empty database.

  ```bash
  docker compose stop
  docker run --rm \
    --volumes-from "$(docker compose ps -aq libre-closet)" \
    -v "$PWD":/out alpine \
    tar czf /out/closet-backup.tgz -C /app/data .
  docker compose start
  ```

## Optional AI suggestions

Off unless `AI_PROVIDER` is set to `ollama`, `openai` or `anthropic`. When on, a **Suggest details** button appears on the new-garment page. Pressing it sends one downscaled photo of that garment, the UI language and your existing category names to the configured model; nothing is sent automatically. Answers are validated before display and applied only when you tap them.

With a local vision model (`qwen2.5vl`, `llama3.2-vision`, `llava`, `gemma3`):

```env
AI_PROVIDER=ollama
AI_MODEL=qwen2.5vl:7b
```

Notes:

- In Docker, `127.0.0.1` is the container itself. Add `extra_hosts: ['host.docker.internal:host-gateway']`, set `AI_BASE_URL=http://host.docker.internal:11434/v1`, and make Ollama listen on `OLLAMA_HOST=0.0.0.0`.
- `AI_BASE_URL` must end in `/v1`.
- On CPU, use a smaller model and raise `AI_TIMEOUT_MS` (default 30000).
- A server the app cannot reach produces no log line. Check the link from inside the container (the image has no `curl`):

  ```bash
  docker compose exec libre-closet node -e "fetch('http://host.docker.internal:11434/v1/models').then(r=>r.json()).then(d=>console.log('OK',d.data?.length)).catch(e=>console.log('FAIL',e.cause?.code||e.message))"
  ```

  `ENOTFOUND` means `extra_hosts` is missing, `ECONNREFUSED` means Ollama is not listening on `0.0.0.0`, `UND_ERR_CONNECT_TIMEOUT` usually means a firewall, and `OK 0` means no model is pulled.

## Configuration

Defaults live in `.env` (baked into the image). Override them with real environment variables, or with a gitignored `.env.local` when running from source. A `.env.local` does not work under Docker.

| Variable | Description | Default |
| --- | --- | --- |
| `APP_NAME` | Display name | `Libre Closet` |
| `DATA_PATH` | Directory for the SQLite DB and uploads | `./data` |
| `SITE_URL` | Public address for share links. Must be `https://` | upstream's instance |
| `AUTH_ENABLED` | Enable JWT accounts and login | `false` |
| `DISABLE_REGISTRATION` | Disallow sign ups | `false` |
| `ACCESS_TOKEN_SECRET` | JWT secret - **change for production** | `ChangeMe!` |
| `PWA_ENABLED` | Enable service worker and install prompt (needs HTTPS) | `false` |
| `IMPORT_URL_ENABLED` | Allow importing from a pasted link | `true` |
| `AI_PROVIDER` | `none`, `ollama`, `openai` or `anthropic` | `none` |
| `AI_MODEL` | Model to ask. Required for `ollama` and `openai` | - |
| `AI_BASE_URL` | OpenAI-compatible endpoint, ending in `/v1` | `http://127.0.0.1:11434/v1` |
| `AI_API_KEY` | API key, where the provider wants one | - |
| `AI_TIMEOUT_MS` | Wait for a suggestion, in ms | `30000` |
| `DATABASE_TYPE` | `sqlite` or `postgres` | `sqlite` |
| `DATABASE_HOST` / `PORT` / `USER` / `PASS` / `SCHEMA` / `SSL` | Postgres connection. Port and schema are required | - |
| `FILE_STORAGE_TYPE` | `local` or `object` (S3) | `local` |
| `OBJECT_STORAGE_*` | `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `REGION`, `BUCKET_NAME` (required for S3) | - |
| `EMAIL_TRANSPORT` | `gmail` or `mailgun`; unset means no password-reset mail | - |
| `EMAIL_FROM_ADDRESS`, `EMAIL_PASSWORD`, `EMAIL_DOMAIN`, `EMAIL_API_KEY` | Email credentials for the chosen transport | - |
| `PUBLIC_VAPID_KEY` / `PRIVATE_VAPID_KEY` | Web push keys; generate your own for production | shared default |
| `OPERATOR_NAME` / `OPERATOR_CONTACT` | Who runs this instance, shown on About, privacy and terms | - |
| `SOURCE_URL`, `IMAGE_NAME`, `ICON_NAME` | Source link, `docker run` image and share-preview icon on the landing page | this fork |
| `IMPORT_FETCH_TIMEOUT_MS`, `IMPORT_URL_RATE_LIMIT`, `THROTTLE_LIMIT` | Importer and rate-limit tuning | see `.env` |

Generate secrets:

```bash
openssl rand -base64 60            # ACCESS_TOKEN_SECRET
npx web-push generate-vapid-keys   # VAPID keys
```

## Development

```bash
nvm install && nvm use
npm install
cp .env .env.local     # local overrides (gitignored)
npm run start:dev
```

| Script | Purpose |
| --- | --- |
| `npm run build` / `start:prod` | Build and run in production mode |
| `npm test` / `test:cov` | Unit tests / coverage |
| `npm run test:e2e` / `test:e2e:a11y` | Playwright end-to-end / axe accessibility |
| `npm run test:visual` (`:update`) | Screenshot comparison (needs Docker) / re-record |
| `npm run lighthouse` | Lighthouse on a seeded wardrobe; build first |
| `npm run screenshots` | Retake the README and landing-page screenshots |
| `npm run precommit` | Everything above that gates a commit |

**Migrations** run automatically on boot. To author one:

```bash
npm run build
npx mikro-orm migration:create --config mikro-orm.sqlite.cli-config.ts    # SQLite
npx mikro-orm migration:create --config mikro-orm.postgres.cli-config.ts  # PostgreSQL
```

Never write a SQLite migration that rebuilds the `garment` table: `outfit_garments` cascades on delete and the rebuild would empty every saved outfit.

**Docker build:** `docker build -f docker/Dockerfile -t libre-closet .` (large image, several minutes; build from a fresh clone).

**Publishing:** pushing a `v*` tag builds and pushes `linux/amd64` and `linux/arm64` images to GHCR. GHCR packages are private on first publish; make the package public in its settings.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Fonts, icons and release notes: see `public/assets/fonts/`, `design/`, [CHANGELOG](CHANGELOG.md).

## Contributing

PRs and issues are welcome. Contributions must be compatible with AGPL-3.0.

## License

[GNU AGPL-3.0](LICENSE). Originally built by [Lazztech LLC](https://github.com/Lazztech/Libre-Closet); this fork is maintained by mandatiq.
