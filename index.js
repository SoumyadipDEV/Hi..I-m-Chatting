const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Load environment variables from .env
require('dotenv').config();

const cookieParser = require('cookie-parser');

const db = require('./lib/db');
const createSessionMiddleware = require('./lib/session');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Remove any CSP headers and allow external resources
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Content-Security-Policy-Report-Only');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
  next();
});

// Basic middleware
app.use(express.json());
app.use(cookieParser());

// Session middleware (uses better-sqlite3 session store)
const sessionMiddleware = createSessionMiddleware(db);
app.use(sessionMiddleware);

// Mount auth routes
app.use('/api', authRoutes);

// Server-side Gemini API proxy endpoint (kept intact)
app.post('/api/gemini', async (req, res) => {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid prompt' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server API key not configured' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    // Retry logic with exponential backoff
    const maxRetries = 3;
    let delay = 1000;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${text}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text;
            if (text) {
                return res.json({ text });
            }

            let errorText = 'No content generated.';
            if (candidate?.finishReason) errorText = `Generation failed: ${candidate.finishReason}`;
            if (result.promptFeedback?.blockReason) errorText = `Prompt blocked: ${result.promptFeedback.blockReason}`;
            throw new Error(errorText);
        } catch (err) {
            console.warn(`Gemini attempt ${attempt + 1} failed:`, err.message || err);
            if (attempt === maxRetries - 1) {
                return res.status(502).json({ error: err.message || 'Failed to generate content' });
            }
            // wait before retrying
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
    // Shouldn't reach here
    return res.status(500).json({ error: 'Unhandled server error' });
});

// Serve static files
app.use(express.static(path.resolve('./public')));

app.get('/', (req, res) => {
    return res.sendFile(path.resolve('./public/index.html'));
});

// Socket.IO authentication via session
io.use((socket, next) => {
  // reuse express-session middleware to populate socket.request.session
  sessionMiddleware(socket.request, {}, (err) => {
    if (err) return next(err);
    if (socket.request.session && socket.request.session.user) return next();
    return next(new Error('Unauthorized'));
  });
});

const clients = new Map();

io.on('connection', (socket) => {
    const sess = socket.request.session;
    const user = sess.user;
    const sessionId = socket.request.sessionID;

    if (!user) {
      socket.disconnect(true);
      return;
    }

    clients.set(socket.id, { username: user.username, userId: user.id, sessionId, fullname: user.fullname });

    // broadcast active usernames with fullnames (unique)
    const usernames = Array.from(new Set(Array.from(clients.values()).map(u => u.fullname || u.username)));
    io.emit('update-users', usernames);

    socket.on('user-message', (data) => {
        io.emit('broadcast', data);
    });

    socket.on('disconnect', () => {
        const info = clients.get(socket.id);
        if (info && info.sessionId) {
            const { sessionId: sid, userId } = info;
            const { DateTime } = require('luxon');
            const now = DateTime.now().setZone('Asia/Kolkata').toISO();
            db.updateLogoutBySession(sid, now);
        }
        clients.delete(socket.id);
        const remaining = Array.from(new Set(Array.from(clients.values()).map(u => u.fullname || u.username)));
        io.emit('update-users', remaining);
    });
});

server.listen(3000, () => console.log('Server is On'));
