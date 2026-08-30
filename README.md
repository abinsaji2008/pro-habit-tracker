# DayForge

A high-UI time/place activity planner for recurring routines, study blocks, fixed commitments, and Google Calendar availability.

## Stack
- React 19 + Vite 8
- Firebase Authentication + Firestore
- Google Calendar API + Google Identity Services

## Run
```bash
npm install
npm run dev
```

## Connect Firebase
1. Create a Firebase web app.
2. Enable Google sign-in in Firebase Authentication.
3. Create/enable Firestore.
4. Put the web config into `src/firebaseConfig.js`.

## Connect Google Calendar
1. In Google Cloud, enable Google Calendar API.
2. Configure Google Auth Platform/OAuth for a Web application.
3. Add your local and production origins to Authorized JavaScript origins.
4. Put the OAuth Client ID and API key into `src/firebaseConfig.js`.
5. Use `http://localhost:<vite-port>` while testing.

The browser integration is intentionally session-based. For production-grade automatic sync when the user is not actively on the site, move Google OAuth token exchange/refresh and Calendar synchronization to Firebase Cloud Functions or another backend.
