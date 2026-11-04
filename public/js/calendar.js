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

  // One tab stop for the month, moved by the arrow keys. Without this script its days stay plain links.
  function upgradeMonth() {
    var table = document.querySelector('#cal-month table');
    if (!table || table.getAttribute('role') === 'grid') return;
    table.setAttribute('role', 'grid');
    var links = table.querySelectorAll('tbody a');
    var stop =
      table.querySelector('tr[aria-current] a[aria-current]') ||
      table.querySelector('tr[aria-current] a:not(.cal-out-month)') ||
      table.querySelector('a[aria-current]') ||
      table.querySelector('tbody a:not(.cal-out-month)');
    links.forEach(function (link) {
      link.tabIndex = link === stop ? 0 : -1;
    });
  }

  document.addEventListener('keydown', function (e) {
    var link = e.target.closest && e.target.closest('#cal-month tbody a');
    if (!link || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      link.click();
      return;
    }
    var links = Array.from(document.querySelectorAll('#cal-month tbody a'));
    var index = links.indexOf(link);
    var column = link.closest('td').cellIndex;
    var move = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index - 7,
      ArrowDown: index + 7,
      Home: index - column,
      End: index + 6 - column,
    };
    if (!(e.key in move)) return;
    e.preventDefault();
    var next = links[move[e.key]];
    if (!next) return;
    link.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  });

  // A boosted navigation replaces the page, so nothing else tells a screen reader which week it now shows.
  function announceWeek() {
    var status = document.getElementById('cal-week-status');
    var title = document.getElementById('cal-week-title');
    if (!status || !title) return;
    var week = title.textContent.trim();
    if (status.dataset.week === week) return;
    if (status.dataset.week) status.textContent = week;
    status.dataset.week = week;
  }

  function refresh() {
    upgradeMonth();
    announceWeek();
  }
  document.addEventListener('DOMContentLoaded', refresh);
  document.addEventListener('htmx:afterSettle', refresh);
  document.addEventListener('htmx:historyRestore', refresh);
})();
