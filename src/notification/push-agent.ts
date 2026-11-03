import * as https from 'node:https';
import { guardedLookup } from '../wardrobe/import/url-policy';

/**
 * The agent push notifications are sent through. Subscribing checks an
 * endpoint's address but not what its name resolves to, so this refuses a
 * name that resolves to loopback or a private network when it is dialled, as
 * the importer's fetcher does. `resolve` is for tests.
 */
export const pushAgent = (resolve?: Parameters<typeof guardedLookup>[1]) =>
  new https.Agent({ keepAlive: true, lookup: guardedLookup(false, resolve) });
