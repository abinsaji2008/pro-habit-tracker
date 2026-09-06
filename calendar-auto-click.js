(() => {
  const DELAY_MS = 3000;
  let done = false;

  const getButton = () => [...document.querySelectorAll('button')].find(b =>
    /Connect Google Calendar/i.test(b.textContent || '')
  );

  const trigger = () => {
    if (done) return true;
    const button = getButton();
    if (!button) return false;

    // Trigger the same DOM interaction sequence a real pointer click would
    // generate. React's onClick handler will receive the final click event.
    try {
      button.focus();
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        button.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          buttons: type === 'pointerdown' || type === 'mousedown' ? 1 : 0
        }));
      }
      done = true;
      return true;
    } catch (e) {
      console.warn('DayForge automatic Calendar trigger failed:', e);
      return false;
    }
  };

  // Always attempt exactly 3 seconds after entering/reloading the page.
  setTimeout(() => {
    if (trigger()) return;

    // React can render the button after the 3-second timer. Keep looking
    // briefly so the trigger still happens without another user click.
    const observer = new MutationObserver(() => {
      if (trigger()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }, DELAY_MS);
})();
