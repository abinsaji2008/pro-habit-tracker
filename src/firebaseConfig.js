// Firebase web app configuration for the DayForge frontend.
// Firebase web configuration is intended for client-side use; protect data with Firebase Auth/Firestore rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyAipiHiXzu4mSvK6BbNjImOHYdkqxKSt3c',
  authDomain: 'tracking-98a71.firebaseapp.com',
  databaseURL: 'https://tracking-98a71-default-rtdb.firebaseio.com',
  projectId: 'tracking-98a71',
  storageBucket: 'tracking-98a71.firebasestorage.app',
  messagingSenderId: '841004547092',
  appId: '1:841004547092:web:129ea46b2297ce01c0fb01',
  measurementId: 'G-XQFRPXB3J9'
};

// Google OAuth Web Client ID. Never place the OAuth client secret in frontend code.
export const GOOGLE_CLIENT_ID = '728358241274-6t5jde621j1i0gdeckviiokihvl1ikck.apps.googleusercontent.com';

// Optional Google Calendar API key. Set this later if your Calendar API project requires it.
export const CALENDAR_API_KEY = import.meta.env.VITE_CALENDAR_API_KEY || '';

// Remember that the user has already connected Google Calendar. We persist only a
// non-sensitive flag; the short-lived OAuth access token remains in memory.
const CALENDAR_LINKED_KEY = 'dayforge_calendar_linked';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Mark the calendar as linked as soon as the user intentionally clicks a
  // Google Calendar connect button. This runs in the capture phase so the flag
  // is saved before the existing React click handler starts OAuth.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (button?.textContent?.includes('Connect Google Calendar')) {
      localStorage.setItem(CALENDAR_LINKED_KEY, '1');
    }
  }, true);

  // After a reload, automatically reuse the existing Google grant by invoking
  // the app's existing connect flow with prompt:'' (no consent prompt).
  let attempted = false;
  const autoReconnectCalendar = () => {
    if (attempted || localStorage.getItem(CALENDAR_LINKED_KEY) !== '1') return;

    const button = [...document.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Connect Google Calendar')
    );
    if (!button) return;

    attempted = true;
    // Let React finish its current render before starting OAuth.
    setTimeout(() => button.click(), 50);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoReconnectCalendar, { once: true });
  } else {
    setTimeout(autoReconnectCalendar, 50);
  }

  new MutationObserver(autoReconnectCalendar).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}
