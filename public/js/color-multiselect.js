(function () {
  const KNOWN = window.KNOWN_COLORS;
  const CROSS =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="size-4"><path d="M6 18 18 6M6 6l12 12"/></svg>';
  // A history restore brings back the markup but not the listeners, so the mark cannot live in the DOM.
  const initialised = new WeakSet();

  function swatch(value) {
    const el = document.createElement('span');
    el.className =
      'ms-swatch ms-swatch--' + (KNOWN.has(value) ? value : 'other');
    return el;
  }

  function text(value) {
    const el = document.createElement('span');
    el.className = 'capitalize';
    el.textContent = value;
    return el;
  }

  function announce(box) {
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function initMultiselect(det) {
    if (initialised.has(det)) return;
    initialised.add(det);
    const field = det.parentElement;
    const summary = det.querySelector('summary');
    const summaryText = summary.querySelector('.ms-placeholder');
    const pillsEl = field.querySelector('.ms-pills');
    const searchEl = det.querySelector('.ms-search-input');
    const optionsEl = det.querySelector('.ms-options');
    const emptyEl = det.querySelector('.ms-empty');
    const createRow = det.querySelector('.ms-create');
    const createLabel = det.querySelector('.ms-create-label');
    const countEl = det.querySelector('.ms-count');
    const clearBtn = det.querySelector('.ms-clear');
    const placeholder = det.dataset.placeholder || summaryText.textContent;
    const template = det.dataset.selectedTemplate || '{n}';
    const removeLabel = det.dataset.removeLabel || '';

    const boxes = () => [...optionsEl.querySelectorAll('input[name="color"]')];

    function pill(box) {
      const el = document.createElement('span');
      el.className = 'ms-pill badge';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ms-pill-remove badge badge-sm';
      remove.dataset.val = box.value;
      remove.setAttribute('aria-label', removeLabel + ' ' + box.value);
      remove.innerHTML = CROSS;
      el.append(swatch(box.value), text(box.value), remove);
      return el;
    }

    function renderPills() {
      const checked = boxes().filter((box) => box.checked);
      pillsEl.replaceChildren(...checked.map(pill));
      const count = template.replace('{n}', String(checked.length));
      countEl.textContent = count;
      summaryText.textContent = checked.length ? count : placeholder;
    }

    function filterOptions(q) {
      const needle = q.trim().toLowerCase();
      let visible = 0;
      optionsEl.querySelectorAll('.ms-option').forEach(function (opt) {
        const match =
          !needle ||
          opt.querySelector('input').value.toLowerCase().includes(needle);
        opt.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      emptyEl.hidden = visible !== 0;
      const exists = boxes().some((box) => box.value.toLowerCase() === needle);
      createLabel.textContent = q.trim();
      createRow.hidden = !needle || exists;
    }

    function addCustom(raw) {
      // Stored comma-joined, so a comma would split one colour into two.
      const value = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
      if (!value) return;
      let box = boxes().find(
        (b) => b.value.toLowerCase() === value.toLowerCase(),
      );
      if (!box) {
        const row = document.createElement('label');
        row.className = 'ms-option';
        box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'checkbox';
        box.name = 'color';
        box.value = value;
        row.append(box, swatch(value), text(value));
        optionsEl.appendChild(row);
      }
      box.checked = true;
      searchEl.value = '';
      filterOptions('');
      announce(box);
    }

    optionsEl.addEventListener('change', renderPills);

    pillsEl.addEventListener('click', function (e) {
      const remove = e.target.closest('.ms-pill-remove');
      if (!remove) return;
      const index = [...pillsEl.querySelectorAll('.ms-pill-remove')].indexOf(
        remove,
      );
      const box = boxes().find((b) => b.value === remove.dataset.val);
      if (!box) return;
      box.checked = false;
      announce(box);
      const left = pillsEl.querySelectorAll('.ms-pill-remove');
      (left[index] || left[index - 1] || summary).focus();
    });

    searchEl.addEventListener('input', function () {
      filterOptions(searchEl.value);
    });
    searchEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!createRow.hidden) addCustom(searchEl.value);
    });
    createRow.addEventListener('click', function () {
      addCustom(searchEl.value);
    });

    clearBtn.addEventListener('click', function () {
      const checked = boxes().filter((box) => box.checked);
      checked.forEach(function (box) {
        box.checked = false;
      });
      searchEl.value = '';
      filterOptions('');
      if (checked.length) announce(checked[0]);
    });

    det.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !det.open) return;
      e.preventDefault();
      det.open = false;
      summary.focus();
    });

    // The list overlays the fields below it, so it must not stay open behind the focus.
    det.addEventListener('focusout', function (e) {
      if (det.open && e.relatedTarget && !det.contains(e.relatedTarget))
        det.open = false;
    });

    det.addEventListener('toggle', function () {
      if (det.open) {
        // On a touch screen the search would open the keyboard over half the list.
        if (matchMedia('(pointer: fine)').matches) {
          setTimeout(function () {
            searchEl.focus();
          }, 10);
        }
      } else {
        searchEl.value = '';
        filterOptions('');
      }
    });

    renderPills();
  }

  function initAll(root) {
    (root || document).querySelectorAll('.color-ms').forEach(initMultiselect);
  }

  document.addEventListener('click', function (e) {
    const path = e.composedPath();
    document.querySelectorAll('.color-ms[open]').forEach(function (det) {
      if (!path.includes(det.parentElement)) det.open = false;
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    initAll();
  });

  // e.target, not e.detail.target: for an outerHTML swap the latter is the old, detached node.
  document.addEventListener('htmx:afterSwap', function (e) {
    initAll(e.target && e.target.isConnected ? e.target : document);
  });
})();
