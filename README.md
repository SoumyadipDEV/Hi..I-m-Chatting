# Hi..I-m-Chatting

A real-time chat application with authentication, two chat modes (User Chat & AI Chat), and persistent login tracking.

---

## Features
- **User Authentication** — SQLite-backed signup/login with bcrypt password hashing
- **Session Management** — Express-session with 7-day expiry, httpOnly cookies
- **Password Reset** — Token-based password recovery using chat username only
- **Real-time User Chat** — Socket.IO for peer-to-peer messaging with active user list
- **AI Chat Mode** — Server-side proxy to Google Gemini API (API key kept secure on server)
- **Login Logging** — Tracks login/logout times, IP address, and user full names
- **Message Timestamps** — Every message displays IST (Asia/Kolkata) timestamp in format `[MM/DD/YY, HH:MM:SS AM/PM]`
- **Message Persistence** — All user chat messages stored in SQLite database with timestamps
- **Typing Indicators** — Shows `[username] is typing...` in real-time, auto-hides after 2 seconds of inactivity
- **User Avatars** — Colored circular avatars with first letter of username (8-color palette, deterministic per user)
- **Browser Notifications** — Desktop notifications for new messages (with permission request)
- **Two UI Modes** — Switch between User Chat and AI Chat with mode toggle
- **Light/Dark Theme** — Toggle between light and dark modes
- **Active Users Display** — Shows logged-in users with avatars and online status in top-right status box
- **Improved Error Handling** — Detailed validation and error messages on auth forms
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
- **SQLite** (`data/app.db`) with four tables:
  - `users` — User accounts with password hashes, fullnames, emails, creation/last login timestamps
  - `login_logs` — Login/logout activity tracking with IP addresses and session IDs
  - `messages` — Chat message history with user info, content, timestamps, and message type
  - `reset_tokens` — Password reset tokens with expiration and usage tracking

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
│   ├── reset.html             # Password reset page
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

### Password Recovery
1. On login page, click "Forgot password?"
2. Enter your chat username to generate a reset token
3. Token displayed with 30-minute expiration
4. Enter new password and confirm
5. Password reset successful, redirected to login
6. Log in with new password

### Chat Page (`/index.html`)
- **User Chat Mode** (default)
  - Send messages to other connected users
  - See active users list with colored avatars in top-right status box
  - Messages display with sender name, IST timestamp, and content
  - Real-time typing indicators show who's typing
  - Desktop notifications for incoming messages
  - Message history persisted in database
  
- **AI Chat Mode** (toggle switch under chat box)
  - Chat with Gemini AI
  - Server securely proxies requests via `/api/gemini`
  - Typing animation while AI responds
  
- **Controls**
  - Mode toggle: Switch between User Chat and AI Chat
  - Theme toggle: Switch between Light and Dark modes
  - Logout button: In top-right status box

### Message Features
- **Timestamps** — All messages display IST time (Asia/Kolkata): `[MM/DD/YY, HH:MM:SS AM/PM]`
- **Typing Indicators** — See `[username] is typing...` in real-time, auto-hides after 2 seconds
- **Avatars** — Colored circular badges with user's first letter (8-color palette, deterministic)
- **Notifications** — Browser desktop notifications for new messages (requires permission)
- **Persistence** — All chat messages stored in database with full metadata

### Login Tracking
- Every login/logout is recorded in `login_logs` table
- Tracks: username, full name, login time, logout time (IST timezone), IP address, session ID

---

## API Endpoints

### Authentication
- `POST /api/signup` — Register new user (validates email, password, username)
- `POST /api/login` — Log in (sets session cookie, records login time)
- `POST /api/logout` — Log out (destroys session, records logout time)
- `POST /api/forgot-password` — Generate password reset token (takes username, returns token with 30 min expiry)
- `POST /api/reset-password` — Reset password with token (validates token, updates password, marks token as used)
- `GET /api/me` — Get current user (returns 401 if not authenticated)

### Chat
- `POST /api/gemini` — Proxy requests to Gemini API (requires authentication, includes retry logic)

### Socket.IO Events
- `user-message` — Send message to other users (includes timestamp, stored in DB)
- `broadcast` — Receive message from other users (with IST timestamp)
- `typing` — Send typing indicator
- `stop-typing` — Clear typing indicator
- `user-typing` — Receive typing indicator from other users
- `user-stop-typing` — Receive stop typing from other users
- `update-users` — Receive list of active users with fullnames
- `disconnect` — Triggered when user disconnects (updates logout time)

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

## New Features (v2.0)

### 🔑 Password Reset
- Token-based password recovery using username only
- Tokens valid for 30 minutes
- Tokens hashed in database (not stored plaintext)
- Two-step process: Generate token → Reset password
- Prevents replay attacks with usage tracking

### 📋 Message Timestamps
- All user chat messages display IST timezone timestamps
- Format: `[MM/DD/YY, HH:MM:SS AM/PM]`
- Timestamps persisted in database

### 💾 Message Persistence  
- Chat messages automatically stored in SQLite `messages` table
- Includes user info, content, type, and timestamp
- Supports future message history retrieval/replay

### ⌨️ Typing Indicators
- Shows `[username] is typing...` in real-time
- Auto-hides after 2 seconds of keyboard inactivity
- Socket.IO events: `typing`, `stop-typing`, `user-typing`, `user-stop-typing`

### 👤 User Avatars & Badges
- Colored circular avatars with first letter of username
- 8-color deterministic palette (color based on first character)
- Green online status dot next to avatar
- Displayed in active users list in status box

### 🔔 Browser Notifications
- Desktop notifications for new messages (requires permission)
- Shows sender name and message preview
- Notification displayed even when app is in background
- Auto-requests permission on first load

### ✅ Improved Error Handling
- **Login:** Empty field validation, network error details
- **Signup:** Email format validation, username length check (3+ chars), password match verification, detailed error messages
- Better console logging for debugging (`[AUTH]`, `[LOGIN]`, `[SIGNUP]`, `[LOGOUT]` prefixes)

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
- Password reset tokens are hashed (SHA256) and stored, never plaintext
- Reset tokens have 30-minute expiration and can only be used once
- Gemini API key kept on server (never sent to client)
- User authentication required for Socket.IO and API access
- Login activity tracked for audit purposes
- HTML escaping prevents XSS attacks in chat messages
- Input validation on all auth endpoints

---

## Troubleshooting

### "Login failed" error
- Check username and password are correct
- Ensure database has been initialized (happens automatically on first run)

### Users not appearing in status box
- Ensure other users are connected to the same server
- Check browser console for Socket.IO connection errors

### Typing indicators not showing
- Ensure other users are connected to the same server
- Check that browser allows JavaScript execution

### Notifications not working
- Grant notification permission when browser prompts
- Check browser notification settings (Chrome: Settings → Privacy → Notifications)
- Some browsers require HTTPS for notifications (localhost works in development)

### AI Chat not working
- Verify `GEMINI_API_KEY` is set in `.env`
- Check server logs for API errors
- Gemini API might be rate-limited or temporarily unavailable

### Messages not persisting
- Check browser console for database errors
- Ensure server has write permissions to `data/` directory
- Check that SQLite file exists at `data/app.db`

### Dark mode not persisting
- Dark mode is client-side only (not persisted)
- Currently resets on page refresh

### Missing avatars/styling issues
- Clear browser cache (Ctrl+Shift+Delete)
- Reload page (Ctrl+F5 for hard refresh)
- Check that CSS files are loading correctly

---

## License
MIT

---

## Author
[@SoumyadipDEV](https://github.com/SoumyadipDEV)
