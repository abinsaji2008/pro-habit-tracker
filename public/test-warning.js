(function () {
  const host = window.location.hostname;
  const isTestHost = host.endsWith('.vercel.app') || host.includes('test');
  if (!isTestHost) return;

  const warning = document.createElement('div');
  warning.setAttribute('role', 'status');
  warning.textContent = '⚠️ TEST VERSION — This is a testing site. Changes and data may be temporary.';
  Object.assign(warning.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    padding: '9px 14px',
    background: '#f59e0b',
    color: '#111827',
    textAlign: 'center',
    font: '600 13px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxSizing: 'border-box',
    boxShadow: '0 2px 8px rgba(0,0,0,.2)'
  });

  document.documentElement.style.scrollPaddingTop = '40px';
  document.addEventListener('DOMContentLoaded', function () {
    document.body.style.paddingTop = '40px';
    document.body.insertBefore(warning, document.body.firstChild);
  }, { once: true });
})();
