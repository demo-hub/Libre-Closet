#!/usr/bin/env sh
# Screenshot tests with Chromium from the pinned Playwright image; the app and runner stay on the host's Node.
set -eu
IMAGE=mcr.microsoft.com/playwright:v1.60.0-noble
NAME=lc-visual-browser
PORT=3333

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --init --ipc=host --network host --name "$NAME" \
  --user pwuser --workdir /home/pwuser "$IMAGE" \
  /bin/sh -c "npx -y playwright@1.60.0 run-server --port $PORT --host 127.0.0.1" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

i=0
until docker logs "$NAME" 2>&1 | grep -q 'Listening on'; do
  i=$((i + 1))
  if [ "$i" -gt 120 ] || [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != true ]; then
    docker logs "$NAME" 2>&1
    exit 1
  fi
  sleep 1
done

VISUAL=1 PW_VISUAL_WS="ws://127.0.0.1:$PORT/" npx playwright test \
  --project=visual-desktop --project=visual-mobile "$@"
