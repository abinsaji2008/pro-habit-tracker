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
