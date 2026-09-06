(() => {
  const DELAY_MS = 3000;
  let clicked = false;

  function findConnectButton() {
    return [...document.querySelectorAll('button')].find(button =>
      /Connect Google Calendar/i.test(button.textContent || '')
    );
  }

  function trigger() {
    if (clicked) return;
    const button = findConnectButton();
    if (!button) return;

    clicked = true;
    try {
      button.click();
    } catch (_) {
      clicked = false;
    }
  }

  // Wait exactly 3 seconds after the page is entered/reloaded.
  setTimeout(() => {
    trigger();

    // React may render the button slightly later, so retry briefly if needed.
    if (!clicked) {
      const observer = new MutationObserver(() => {
        trigger();
        if (clicked) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }
  }, DELAY_MS);
})();
