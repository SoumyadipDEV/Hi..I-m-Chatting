const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Load environment variables from .env
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Parse JSON bodies for API endpoints
app.use(express.json());

const users = new Map();

io.on('connection', (socket) => {
    socket.on('add-user', (name) => {
        users.set(socket.id, name);
        io.emit('update-users', Array.from(users.values()));
    });

    socket.on('user-message', (data) => {
        io.emit('broadcast', data);
    });

    socket.on('disconnect', () => {
        users.delete(socket.id);
        io.emit('update-users', Array.from(users.values()));
    });
});

// Server-side Gemini API proxy endpoint
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

app.use(express.static(path.resolve('./public')));

app.get('/', (req, res) => {
    return res.sendFile(path.resolve('./public/index.html'));
});

server.listen(3000, () => console.log('Server is On'));
