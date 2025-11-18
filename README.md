# Hi..I-m-Chatting

Minimal chat app with two modes: a user-to-user chat (Socket.IO) and an AI chat mode proxied via a server-side Gemini API endpoint.

---

## Features
- Real-time user chat using Socket.IO
- Server-side proxy to Google Gemini (generative language) API (keeps API key on server)
- Two UI modes: User Chat and AI Chat
- Light/Dark mode toggles
- Centered, fixed-height chat cards with internal scrolling
- Animated send buttons (matching UI across modes)

---

## Repo layout
- `index.js` — Express + Socket.IO server and `/api/gemini` proxy endpoint
- `public/` — Frontend static files (HTML/CSS/JS)
  - `public/index.html` — Single-page UI for both chat modes
- `.env` — Environment variables (not committed)

---

## Requirements
- Node.js 18+ recommended (native fetch). If using Node < 18, install `node-fetch`.
- npm

---

## Environment variables
Create a `.env` file in the project root with:

GEMINI_API_KEY should be kept secret and never committed.

Example `.env`:

---

Start server:
node `index.js`.

Open browser:
`http://localhost:3000`
