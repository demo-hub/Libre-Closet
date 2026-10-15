// Every copy button: <button data-copy="text" data-label="Copy link" data-done="Copied">.
// Optional: data-toast="id" shows that toast while "Copied" is up, and data-hide="selector"
// hides other toasts first.
//
// navigator.clipboard exists only in a secure context (HTTPS or localhost), so on a LAN
// address over plain http the text is put in a read-only field next to the button
// instead, copied from there if the browser still allows it, and otherwise left
// selected with a hint to press Ctrl+C or ⌘C.
(function () {
  if (window.__lcCopyBound) return;
  window.__lcCopyBound = true;

  function setLabel(button, text) {
    const span = button.querySelector('span');
    if (span) span.textContent = text;
  }

  function confirmCopied(button) {
    setLabel(button, button.dataset.done);
    const toast =
      button.dataset.toast && document.getElementById(button.dataset.toast);
    if (button.dataset.hide) {
      document
        .querySelectorAll(button.dataset.hide)
        .forEach((t) => t.classList.add('hidden'));
    }
    if (toast) toast.classList.remove('hidden');
    clearTimeout(button.__lcCopyTimer);
    button.__lcCopyTimer = setTimeout(() => {
      setLabel(button, button.dataset.label);
      if (toast) toast.classList.add('hidden');
    }, 2000);
  }

  function hint() {
    const texts = document.getElementById('copy-texts');
    if (!texts) return '';
    // A phone has no keyboard shortcut to name.
    if (
      matchMedia('(pointer: coarse)').matches &&
      !matchMedia('(any-pointer: fine)').matches
    ) {
      return texts.dataset.touch;
    }
    const mac = /Mac|iPhone|iPad/.test(
      navigator.platform || navigator.userAgent,
    );
    return texts.dataset.keys.replace('{keys}', mac ? '⌘C' : 'Ctrl+C');
  }

  /**
   * The hint after the button, and the read-only field to copy from: the page's
   * own when data-field names one that already shows the text, else one made here.
   */
  function fallbackParts(button) {
    let box = button.nextElementSibling;
    if (!box || !box.classList.contains('copy-fallback')) {
      box = document.createElement('div');
      box.className =
        'copy-fallback col-span-full grid w-full basis-full gap-1';
      const note = document.createElement('p');
      note.className = 'text-sm text-graphite empty:hidden';
      note.id = 'copy-hint-' + Math.random().toString(36).slice(2);
      note.setAttribute('role', 'status');
      box.append(note);
      button.after(box);
    }
    const note = box.querySelector('p');
    let input =
      button.dataset.field && document.getElementById(button.dataset.field);
    if (!input) {
      input = box.querySelector('input');
      if (!input) {
        input = document.createElement('input');
        input.type = 'text';
        input.readOnly = true;
        input.className = 'input input-sm w-full';
        input.setAttribute('aria-label', button.dataset.label);
        box.prepend(input);
      }
      input.value = button.dataset.copy;
    }
    input.setAttribute('aria-describedby', note.id);
    return { box, input, note };
  }

  function copyByHand(button) {
    const { box, input, note } = fallbackParts(button);
    input.focus();
    input.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    if (copied) {
      box.remove();
      input.removeAttribute('aria-describedby');
      button.focus();
      confirmCopied(button);
    } else {
      note.textContent = hint();
    }
  }

  document.addEventListener('click', (event) => {
    const button =
      event.target.closest && event.target.closest('button[data-copy]');
    if (!button) return;
    if (
      window.isSecureContext &&
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      navigator.clipboard.writeText(button.dataset.copy).then(
        () => confirmCopied(button),
        () => copyByHand(button),
      );
    } else {
      copyByHand(button);
    }
  });
})();
