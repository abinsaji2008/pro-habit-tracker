(() => {
  const CONNECTED_KEY = 'dayforge_google_calendar_connected';
  const LAST_ATTEMPT_KEY = 'dayforge_google_calendar_last_auto_attempt';
  const RETRY_WINDOW_MS = 15000;

  const connectedPattern = /Google Calendar connected/i;
  const connectPattern = /Connect Google Calendar/i;

  function scan() {
    const buttons = Array.from(document.querySelectorAll('button'));

    // Remember a successful Calendar connection across page reloads.
    if (buttons.some(button => connectedPattern.test(button.textContent || ''))) {
      localStorage.setItem(CONNECTED_KEY, '1');
      localStorage.removeItem(LAST_ATTEMPT_KEY);
      return;
    }

    if (localStorage.getItem(CONNECTED_KEY) !== '1') return;

    const button = buttons.find(button => connectPattern.test(button.textContent || ''));
    if (!button) return;

    const now = Date.now();
    const lastAttempt = Number(localStorage.getItem(LAST_ATTEMPT_KEY) || '0');
    if (now - lastAttempt < RETRY_WINDOW_MS) return;

    localStorage.setItem(LAST_ATTEMPT_KEY, String(now));

    // The app already calls Google's token client with prompt:''.
    // Clicking the existing React control programmatically lets that silent
    // authorization path run automatically after a reload.
    setTimeout(() => {
      try { button.click(); } catch (_) {}
    }, 500);
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  // A small delayed scan covers the initial React render.
  setTimeout(scan, 1200);
})();
