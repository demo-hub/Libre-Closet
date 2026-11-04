// Answers from the calendar's routes, named by their HX-Trigger header.
(function () {
  if (window.__lcCalendarBound) return;
  window.__lcCalendarBound = true;

  document.addEventListener('calendarWorn', function (e) {
    e.target
      .querySelector('button')
      .setAttribute('aria-pressed', e.detail.worn);
    e.target.querySelector('[name=worn]').value = !e.detail.worn;
  });

  // htmx would restore a snapshot of this week from another address, entry and all. Without one, Back asks the server.
  document.addEventListener('calendarEntryRemoved', function () {
    try {
      var snapshots =
        JSON.parse(sessionStorage.getItem('htmx-history-cache')) || [];
      sessionStorage.setItem(
        'htmx-history-cache',
        JSON.stringify(
          snapshots.filter(function (s) {
            return !/^\/calendar(\?|$)/.test(s.url);
          }),
        ),
      );
    } catch (err) {}
  });
})();
