/**
 * Replays a share the service worker had to keep.
 *
 * A share that arrived with an expired session, or with no network, was stashed
 * rather than lost, and the browser was sent here with its id. This hands it
 * back to the server exactly as the OS did the first time — a real form post,
 * so the whole share-target path runs unchanged.
 */
import { dropStash, readStash } from '/js/share-stash.js';

const stashId = () => new URLSearchParams(location.search).get('shared');

/** Rebuilds the share as a form and submits it, the way the OS would have. */
const replay = (body) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/wardrobe/import/share';
  form.enctype = 'multipart/form-data';
  form.hidden = true;
  // Not boosted: this has to be a real navigation, and htmx would swap the
  // response into the page instead.
  form.setAttribute('hx-disable', '');

  for (const [name, value] of body.entries()) {
    if (value instanceof File) {
      const input = document.createElement('input');
      input.type = 'file';
      input.name = name;
      const data = new DataTransfer();
      data.items.add(value);
      input.files = data.files;
      form.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
  }

  document.body.appendChild(form);
  form.submit();
};

const run = async () => {
  if (!('caches' in window)) return;
  const id = stashId();
  if (!id) return;

  // Offline, replaying only fails and gets the share stashed again, which
  // redirects back here: a loop that never lets go. The offline page says a
  // share is waiting instead, and it replays when the network returns.
  if (navigator.onLine === false) return;

  // One attempt per id per tab, so a replay that lands back on this page
  // cannot start another.
  const attempted = `share-replay:${id}`;
  if (sessionStorage.getItem(attempted)) return;

  try {
    const stashed = await readStash(caches, id, Date.now());
    if (!stashed) return;
    sessionStorage.setItem(attempted, '1');
    // Taken before it is replayed: if the replay fails the user is back here
    // with the form open, and a share that replays forever is worse than one
    // that asks to be shared again.
    await dropStash(caches, id);
    replay(stashed.body);
  } catch (err) {
    console.warn('[share-replay] could not replay the stashed share:', err);
  }
};

void run();
