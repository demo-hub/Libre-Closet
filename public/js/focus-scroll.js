// Firefox does not scroll a partly visible control out from under the header or the dock
// when it takes focus, so at 360×568 only 19 of a 44 px control can show. The browsers
// that do scroll land in the same place, because scrollIntoView honours scroll-padding.
(function () {
  if (window.__lcFocusScrollBound) return;
  window.__lcFocusScrollBound = true;

  document.addEventListener('focusin', function (e) {
    const el = e.target;
    if (!(el instanceof Element)) return;
    // The bars and a modal's controls cannot sit under a bar, and scrolling for them would move the page.
    if (el.closest('.app-header, .dock, dialog, .skip-link')) return;
    // A press on a button is left alone, since it is where the pointer already is. A text field counts as focus-visible even then, and scrolling it clear does no harm.
    if (!el.matches(':focus-visible')) return;
    const style = getComputedStyle(document.documentElement);
    const top = parseFloat(style.scrollPaddingTop) || 0;
    const bottom = innerHeight - (parseFloat(style.scrollPaddingBottom) || 0);
    const rect = el.getBoundingClientRect();
    // Taller than the gap between the bars, it fits nowhere, and "nearest" would jump.
    if (rect.height > bottom - top) return;
    if (rect.top < top || rect.bottom > bottom)
      el.scrollIntoView({ block: 'nearest' });
  });
})();
