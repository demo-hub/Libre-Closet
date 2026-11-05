// Previous, Next and a swipe step an outfit row through its garments, and the
// row and its buttons are replaced each time. So a press during a request only
// moves the index wanted, and each answer asks for the next until they agree.
(function () {
  if (window.stepOutfitRow) return;

  /** Row key to the index wanted and the row asked for, while its request runs. */
  const wanted = new Map();

  /** Keys repeat across pages, so a row that has left the page holds nothing up. */
  const pending = (key) => {
    const entry = wanted.get(key);
    return entry?.row.isConnected ? entry : undefined;
  };

  function request(row) {
    const { category, key } = row.dataset;
    const entry = wanted.get(key);
    entry.row = row;
    const url = `/outfits/row-fragment?category=${encodeURIComponent(category)}&index=${entry.index}&key=${key}`;
    Promise.resolve(
      htmx.ajax('GET', url, { target: row, swap: 'outerHTML settle:0ms' }),
    ).catch(() => wanted.delete(key));
  }

  function say(text) {
    document.getElementById('outfit-rows-status').textContent = text;
  }

  window.stepOutfitRow = function (row, by) {
    const { key } = row.dataset;
    const slots = Number(row.dataset.count) + 1; // Index 0 is the empty slot.
    if (slots < 2) return;
    const running = pending(key);
    const from = running ? running.index : Number(row.dataset.index);
    const index = (from + by + slots) % slots;
    if (running) {
      running.index = index;
    } else {
      wanted.set(key, { row, index });
      request(row);
    }
  };

  document.addEventListener('click', function (e) {
    const button = e.target.closest?.('.outfit-row [data-step]');
    if (button) {
      window.stepOutfitRow(
        button.closest('.outfit-row'),
        Number(button.dataset.step),
      );
    }
  });

  document.addEventListener('htmx:afterSwap', function (e) {
    // Add row appends to the list, and the event comes from the list.
    if (e.target.id === 'outfit-rows-list') {
      const rows = [...e.target.querySelectorAll(':scope > .outfit-row')];
      const row = rows[rows.length - 1];
      say(
        e.target.dataset.addedTemplate
          .replace('{name}', () => row.dataset.label)
          .replace('{n}', String(rows.length))
          .replace('{total}', String(rows.length)),
      );
      return;
    }
    const row = e.target;
    if (!row.matches?.('.outfit-row')) return;
    const { key, label, garment, index, count } = row.dataset;
    const entry = wanted.get(key);
    if (!entry) return;
    // The server stops at the count it has, which can be below the page's.
    entry.index = Math.min(entry.index, Number(count));
    if (entry.index !== Number(index)) return request(row);
    wanted.delete(key);
    say(
      row.parentElement.dataset.garmentTemplate
        .replace('{name}', () => label)
        .replace('{garment}', () => garment),
    );
  });

  // An error answer swaps nothing, so the row must not wait for one. A request
  // that never got an answer rejects, and request() handles that.
  document.addEventListener('htmx:responseError', function (e) {
    const row = e.detail.target;
    if (row?.matches?.('.outfit-row')) wanted.delete(row.dataset.key);
  });
})();
