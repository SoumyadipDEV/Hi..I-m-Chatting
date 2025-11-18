# Hi..I-m-Chatting

A real-time chat application with authentication, two chat modes (User Chat & AI Chat), and persistent login tracking.

---

## Features
- **User Authentication** — SQLite-backed signup/login with bcrypt password hashing
- **Session Management** — Express-session with 7-day expiry, httpOnly cookies
- **Real-time User Chat** — Socket.IO for peer-to-peer messaging with active user list
- **AI Chat Mode** — Server-side proxy to Google Gemini API (API key kept secure on server)
- **Login Logging** — Tracks login/logout times, IP address, and user full names
- **Two UI Modes** — Switch between User Chat and AI Chat with mode toggle
- **Light/Dark Theme** — Toggle between light and dark modes
- **Active Users Display** — Shows logged-in users in the status box (top-right corner)
- **Responsive Design** — Clean, centered UI with fixed-height chat cards and internal scrolling

---

## Architecture

### Backend
- `index.js` — Express + Socket.IO server, auth routes, and `/api/gemini` proxy
- `lib/db.js` — SQLite database initialization and helper functions
- `lib/session.js` — Express-session middleware factory with persistent session store
- `routes/auth.js` — Authentication endpoints (signup, login, logout, get current user)

### Frontend
- `public/index.html` — Main chat UI with dual-mode support
- `public/login.html` — Login form (email/password authentication)
- `public/signup.html` — Signup form (5-field registration: fullname, username, email, password, confirm password)
- `public/auth.css` — Styling for auth pages (login/signup)
- `public/chat.css` — Styling for main chat page

### Database
- **SQLite** (`data/app.db`) with two tables:
  - `users` — User accounts with password hashes, fullnames, emails, creation/last login timestamps
  - `login_logs` — Login/logout activity tracking with IP addresses

---

## Repo Layout
```
.
├── index.js                    # Express + Socket.IO server
├── lib/
│   ├── db.js                  # SQLite database initialization
│   ├── session.js             # Express-session middleware
│   └── routes/
│       └── auth.js            # Auth endpoints
├── public/
│   ├── index.html             # Main chat UI
│   ├── login.html             # Login page
│   ├── signup.html            # Signup page
│   ├── auth.css               # Auth styles
│   ├── chat.css               # Chat styles
│   └── data/
│       └── app.db             # SQLite database (auto-created)
├── package.json               # Dependencies
├── .env                       # Environment variables (not committed)
└── README.md                  # This file
```

---

## Requirements
- Node.js 18+ (native fetch support)
- npm
- SQLite3 (via better-sqlite3 package)

---

## Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd Hi..I-m-Chatting
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env` file** in the project root:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Keep this file secret and never commit it

4. **Start the server**
   ```bash
   node index.js
   ```
   Server runs on `http://localhost:3000`

---

## Usage Flow

### First-Time Setup
1. Visit `http://localhost:3000`
2. Redirected to `/login.html`
3. Click "Sign up" to create an account
4. Fill signup form: Full Name, Chat Username (unique), Email, Password (8+ chars)
5. Submit and redirected to login
6. Log in with your credentials
7. Redirected to chat page

### Chat Page (`/index.html`)
- **User Chat Mode** (default)
  - Send messages to other connected users
  - See active users list in top-right status box
  - Messages appear with usernames and timestamps
  
- **AI Chat Mode** (toggle switch under chat box)
  - Chat with Gemini AI
  - Server securely proxies requests via `/api/gemini`
  
- **Controls**
  - Mode toggle: Switch between User Chat and AI Chat
  - Theme toggle: Switch between Light and Dark modes
  - Logout button: In top-right status box

### Login Tracking
- Every login/logout is recorded in `login_logs` table
- Tracks: username, full name, login time, logout time (IST timezone), IP address, session ID

---

## API Endpoints

### Authentication
- `POST /api/signup` — Register new user
- `POST /api/login` — Log in (sets session cookie)
- `POST /api/logout` — Log out (destroys session)
- `GET /api/me` — Get current user (returns 401 if not authenticated)

### Chat
- `POST /api/gemini` — Proxy requests to Gemini API (requires authentication)

### Socket.IO Events
- `user-message` — Send message to other users
- `broadcast` — Receive message from other users
- `update-users` — Receive list of active users
- `disconnect` — Triggered when user disconnects

---

## Environment Variables
```env
GEMINI_API_KEY=sk-... # Your Google Gemini API key
```

---

## Dependencies
- **express** — Web framework
- **socket.io** — Real-time bidirectional communication
- **better-sqlite3** — SQLite database driver
- **better-sqlite3-session-store** — Persistent session store
- **express-session** — Session management
- **bcryptjs** — Password hashing
- **luxon** — Timezone handling (IST timestamps)
- **cookie-parser** — Cookie parsing

---

## Security Notes
- Passwords are hashed with bcryptjs (10 rounds)
- Sessions stored in SQLite with 7-day expiry
- Cookies are httpOnly and sameSite='lax'
- Gemini API key kept on server (never sent to client)
- User authentication required for Socket.IO and API access
- Login activity tracked for audit purposes

---

## Troubleshooting

### "Login failed" error
- Check username and password are correct
- Ensure database has been initialized (happens automatically on first run)

### Users not appearing in status box
- Ensure other users are connected to the same server
- Check browser console for Socket.IO connection errors

### AI Chat not working
- Verify `GEMINI_API_KEY` is set in `.env`
- Check server logs for API errors

### Dark mode not persisting
- Dark mode is client-side only (not persisted)
- Currently resets on page refresh

---

## License
MIT

---

## Author
[@SoumyadipDEV](https://github.com/SoumyadipDEV)
