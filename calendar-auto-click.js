(() => {
  const DELAY_MS = 3000;
  const FALLBACK_CHECK_MS = 1800;
  let attempted = false;
  let fallbackShown = false;

  const getButton = () => [...document.querySelectorAll('button')].find(b =>
    /Connect Google Calendar/i.test(b.textContent || '')
  );

  const trigger = () => {
    const button = getButton();
    if (!button) return true;

    try {
      button.focus();
      button.click();
      return true;
    } catch (e) {
      console.warn('DayForge automatic Calendar trigger failed:', e);
      return false;
    }
  };

  const showFallback = () => {
    if (fallbackShown || !getButton()) return;
    fallbackShown = true;

    const overlay = document.createElement('div');
    overlay.id = 'dayforge-calendar-auth-fallback';
    overlay.innerHTML = `
      <div class="df-cal-modal-backdrop">
        <div class="df-cal-modal" role="dialog" aria-modal="true" aria-labelledby="df-cal-title">
          <button class="df-cal-close" type="button" aria-label="Close">×</button>
          <div class="df-cal-kicker">GOOGLE CALENDAR</div>
          <h2 id="df-cal-title">Calendar access needs one click</h2>
          <p>Your Google Calendar session is already available, but the browser requires a user action to continue.</p>
          <button class="df-cal-connect" type="button">Connect Google Calendar</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #dayforge-calendar-auth-fallback{position:fixed;inset:0;z-index:2147483647}
      .df-cal-modal-backdrop{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.62);backdrop-filter:blur(5px)}
      .df-cal-modal{position:relative;width:min(420px,100%);box-sizing:border-box;padding:26px;border:1px solid #253552;border-radius:18px;background:#0d1422;color:#eef4ff;box-shadow:0 25px 80px rgba(0,0,0,.5);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
      .df-cal-kicker{font-size:10px;letter-spacing:.16em;color:#72809a;font-weight:700}
      .df-cal-modal h2{margin:7px 34px 8px 0;font-size:21px}
      .df-cal-modal p{margin:0 0 20px;color:#98a6bd;font-size:13px;line-height:1.55}
      .df-cal-connect{width:100%;border:0;border-radius:10px;padding:12px 14px;background:#eaf2ff;color:#09101a;font-size:13px;font-weight:800;cursor:pointer}
      .df-cal-close{position:absolute;top:10px;right:10px;width:34px;height:34px;border:0;background:transparent;color:#9aa7bb;font-size:24px;cursor:pointer}
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      style.remove();
      fallbackShown = false;
    };
    overlay.querySelector('.df-cal-close').addEventListener('click', close);
    overlay.querySelector('.df-cal-connect').addEventListener('click', () => {
      const button = getButton();
      if (!button) return close();
      close();
      button.click();
    });
    overlay.querySelector('.df-cal-modal-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) close();
    });
  };

  setTimeout(() => {
    if (!getButton()) return;
    attempted = trigger();
    setTimeout(showFallback, FALLBACK_CHECK_MS);
  }, DELAY_MS);

  const observer = new MutationObserver(() => {
    if (!attempted && getButton()) {
      attempted = trigger();
      if (attempted) setTimeout(showFallback, FALLBACK_CHECK_MS);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), DELAY_MS + 15000);
})();
