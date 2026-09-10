import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { warmStrategyCache } from 'workbox-recipes';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';
import {
  pendingShares,
  stashedShareUrl,
  stashShare,
  wasBouncedToLogin,
} from './share-stash';

// https://developer.chrome.com/docs/workbox/modules/workbox-core#clients_claim
// This clientsClaim() should be at the top level
// of your service worker, not inside of, e.g.,
// an event handler.
clientsClaim();

declare const self: ServiceWorkerGlobalScope;

// Optional: use the injectManifest mode of one of the Workbox
// build tools to precache a list of URLs, including fallbacks.
precacheAndRoute(self.__WB_MANIFEST);

const CACHE_STRATEGY = new NetworkFirst();
const FALLBACK_HTML_URL = '/offline.html';

// Warm the runtime cache with a list of asset URLs
warmStrategyCache({
  urls: [
    FALLBACK_HTML_URL,
    '/modules/htmx.min.js',
    '/modules/_hyperscript.min.js',
    '/modules/sse.js',
    '/modules/pwa-install.bundle.js',
  ],
  strategy: CACHE_STRATEGY,
});

// SSE is a streaming connection - bypass the service worker cache entirely
registerRoute(({ url }) => url.pathname === '/sse', new NetworkOnly());

/**
 * A shared page or photo is a one-shot POST: if the session has expired the
 * server answers with the login page and the payload is gone, and offline it
 * never leaves the device. Either way the user watched their photo vanish.
 *
 * So the share is kept first and the browser is sent somewhere that can find
 * it again. 303 and not 307: a 307 would re-POST the body we just consumed.
 *
 * Every other route here is registered without a method, which files it under
 * GET, so this is the only thing in the worker that sees a POST at all.
 */
registerRoute(
  ({ url, request }) =>
    request.method === 'POST' && url.pathname === '/wardrobe/import/share',
  async ({ request }) => {
    // Cloned before the body is read: a Request body can only be consumed once,
    // and the network attempt needs its own copy.
    const forStash = request.clone();
    const keep = async (fallback?: Response) => {
      try {
        const id = crypto.randomUUID();
        await stashShare(caches, forStash, Date.now(), id);
        return Response.redirect(stashedShareUrl(id), 303);
      } catch (err) {
        // Storage refused it. Better to hand back whatever the network said
        // than to answer a navigation with an exception.
        console.error('[share-stash] could not keep the share:', err);
        return fallback ?? Response.error();
      }
    };

    try {
      // A redirect-following copy, not the request itself: a navigation
      // carries redirect mode "manual", so fetching it as-is yields an
      // opaqueredirect that says nothing about where it went — and the login
      // bounce this exists to catch would be invisible.
      const response = await fetch(new Request(request, { redirect: 'follow' }));
      if (wasBouncedToLogin(response)) return keep(response);
      // A navigation refuses a response that was itself redirected, so where
      // the server sent us has to be re-issued as our own answer.
      return response.redirected
        ? Response.redirect(response.url, 303)
        : response;
    } catch {
      // Offline. The share is still worth keeping.
      return keep();
    }
  },
  'POST',
);

// https://jakearchibald.com/2016/caching-best-practices/
// https://web.dev/articles/service-worker-caching-and-http-caching
// All /file/** file requests: defer caching to server Cache-Control headers.
// NetworkOnly lets the browser's HTTP cache honour the max-age set on these
// routes, making images available offline without the SW holding a second copy.
// request.destination guards against matching /file/files (an HTML navigation).
// https://developer.chrome.com/docs/workbox/caching-strategies-overview#the_cache_interface_versus_the_http_cache
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/file/') && request.destination !== 'document',
  new NetworkOnly(),
);

// Background-removal model resources include a stable resources.json URL.
// Use NetworkFirst to avoid stale metadata/chunk mismatches after deploys.
registerRoute(
  ({ url }) => url.pathname.startsWith('/bg-removal-models/'),
  new NetworkFirst({
    cacheName: 'bg-removal-models-v2',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Keep ORT and background-removal runtime modules fresh so JS/WASM assets don't drift.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/modules/onnxruntime-web/') ||
    url.pathname.startsWith('/modules/background-removal/') ||
    url.pathname.startsWith('/modules/image-blob-reduce/'),
  new NetworkFirst({
    cacheName: 'bg-removal-runtime-modules-v1',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// https://developer.chrome.com/docs/workbox/modules/workbox-routing
registerRoute(() => true, CACHE_STRATEGY);

// https://developer.chrome.com/docs/workbox/managing-fallback-responses
// This "catch" handler is triggered when any of the other routes fail to
// generate a response.
setCatchHandler(async ({ event, request }) => {
  // The warmStrategyCache recipe is used to add the fallback assets ahead of
  // time to the runtime cache, and are served in the event of an error below.
  // Use `event`, `request`, and `url` to figure out how to respond, or
  // use request.destination to match requests for specific resource types.
  console.log(`setCatchHandler callback:`, event);

  // For navigation requests, serve the offline page
  if (request.destination === 'document') {
    return CACHE_STRATEGY.handle({
      event,
      request: new Request(FALLBACK_HTML_URL),
    }).catch(() => Response.error());
  }

  // For other requests, just return an error
  return Response.error();
});

// AGGRESSIVE UPDATE HANDLING
// Skip waiting immediately on install to force update
// Sweeping is opportunistic everywhere else, so do it once on every start:
// a share nobody came back for should not keep a photo forever.
addEventListener('activate', (event) => {
  event.waitUntil(pendingShares(caches, Date.now()).then(() => undefined));
});

addEventListener('install', (event) => {
  console.log('Service worker installing - skipping waiting');
  self.skipWaiting();
});

// Web Push Notification Handling
// https://blog.lekoala.be/the-only-snippet-you-will-need-to-deal-with-push-notifications-in-a-service-worker
// @link https://flaviocopes.com/push-api/
// @link https://web.dev/push-notifications-handling-messages/
(self as any).addEventListener('push', function (event) {
  if (!event.data) {
    console.log('This push event has no data.');
    return;
  }
  if (!(self as any).registration) {
    console.log('Service worker does not control the page');
    return;
  }
  if (!(self as any).registration || !(self as any).registration.pushManager) {
    console.log('Push is not supported');
    return;
  }

  const eventText = event.data.text();
  // Specify default options
  let options = {};
  let title = '';

  // Support both plain text notification and json
  if (eventText.substr(0, 1) === '{') {
    const eventData = JSON.parse(eventText);
    title = eventData.title;

    // Set specific options
    // @link https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification#parameters
    if (eventData.options) {
      options = Object.assign(options, eventData.options);
    }

    // Check expiration if specified
    if (eventData.expires && Date.now() > eventData.expires) {
      console.log('Push notification has expired');
      return;
    }
  } else {
    title = eventText;
  }

  // Warning: this can fail silently if notifications are disabled at system level
  // The promise itself resolve to undefined and is not helpful to see if it has been displayed properly
  const promiseChain = (self as any).registration.showNotification(
    title,
    options,
  );

  // With this, the browser will keep the service worker running until the promise you passed in has settled.
  event.waitUntil(promiseChain);
});
