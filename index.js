// index.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

require('dotenv').config();
const cookieParser = require('cookie-parser');

// --- Dynamic import for TOON (ESM) in CommonJS ---
let toonModule = null;
(async () => {
  try {
    const mod = await import('@toon-format/toon');
    toonModule = mod?.default ? mod.default : mod;
    console.log('TOON module loaded');
  } catch (err) {
    console.warn('TOON module not available (ESM import failed). TOON features disabled.', err?.message || err);
    toonModule = null;
  }
})();

const db = require('./lib/db');
const createSessionMiddleware = require('./lib/session');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Remove any CSP or cross-origin resource policy headers to allow external resources
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

/**
 * Simple token estimator:
 * - Uses byte length heuristic: ~1 token ≈ 4 characters (UTF-8 bytes).
 * - Returns both byte length and estimated tokens (rounded up).
 *
 * NOTE: This is an estimate for comparison (TOON vs JSON). It is NOT an exact model token count.
 */
function estimateTokens(text) {
  const bytes = Buffer.byteLength(String(text ?? ''), 'utf8'); // ensure string
  const estimatedTokens = Math.ceil(bytes / 4); // heuristic
  return { bytes, estimatedTokens };
}

/**
 * Server-side Gemini API proxy endpoint with optional TOON optimization + token reporting
 *
 * Request body expected:
 * {
 *   "prompt": "string",
 *   "contextData": { ... optional structured context ... },
 *   "config": { "responseFormat": "toon" | "text" }  // optional
 *   "systemPrompt": "string" // optional explicit system instruction
 * }
 */
app.post('/api/gemini', async (req, res) => {
  try {
    const { prompt, contextData, config, systemPrompt } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server API key not configured' });
    }

    // Prepare token report object we will populate
    const tokenReport = {
      context: {
        json: null, // { bytes, estimatedTokens }
        toon: null, // { bytes, estimatedTokens } if available
        savings: null // { bytesSaved, tokensSaved, percentSaved } if both available
      },
      prompt: {
        finalPromptBytes: null,
        finalPromptEstimatedTokens: null
      }
    };

    // Build finalPrompt: if contextData is present try TOON encode, otherwise fallback to JSON
    let finalPrompt = prompt;
    let jsonContextString = null;
    let toonContextString = null;

    if (contextData) {
      // JSON string version (used as fallback and for comparison)
      try {
        jsonContextString = JSON.stringify(contextData);
        tokenReport.context.json = estimateTokens(jsonContextString);
      } catch (err) {
        // Fallback if JSON.stringify fails for any reason
        jsonContextString = String(contextData);
        tokenReport.context.json = estimateTokens(jsonContextString);
      }

      if (toonModule && typeof toonModule.encode === 'function') {
        try {
          toonContextString = toonModule.encode(contextData);
          tokenReport.context.toon = estimateTokens(toonContextString);

          // Calculate savings metrics if both exist
          if (tokenReport.context.json && tokenReport.context.toon) {
            const bytesSaved = tokenReport.context.json.bytes - tokenReport.context.toon.bytes;
            const tokensSaved = tokenReport.context.json.estimatedTokens - tokenReport.context.toon.estimatedTokens;
            const percentSaved = tokenReport.context.json.bytes > 0 ? (bytesSaved / tokenReport.context.json.bytes) * 100 : 0;
            tokenReport.context.savings = {
              bytesSaved,
              tokensSaved,
              percentSaved: Math.round(percentSaved * 100) / 100 // round to 2 decimal places
            };
          }

          finalPrompt = `${prompt}\n\n### Context Data (Format: TOON)\n${toonContextString}`;
        } catch (err) {
          console.warn('TOON encode failed, falling back to JSON:', err);
          finalPrompt = `${prompt}\n\n### Context Data (Format: JSON)\n${jsonContextString}`;
        }
      } else {
        // TOON not loaded — fallback to JSON
        finalPrompt = `${prompt}\n\n### Context Data (Format: JSON)\n${jsonContextString}`;
      }
    }

    // After finalPrompt is ready, estimate tokens for the final prompt that will be sent to Gemini
    const finalPromptStats = estimateTokens(finalPrompt);
    tokenReport.prompt.finalPromptBytes = finalPromptStats.bytes;
    tokenReport.prompt.finalPromptEstimatedTokens = finalPromptStats.estimatedTokens;

    // Build system instruction:
    const forceToonOutput = config?.responseFormat === 'toon';
    const finalSystemPrompt =
      typeof systemPrompt === 'string' && systemPrompt.trim().length
        ? systemPrompt
        : forceToonOutput
        ? 'You MUST return the response strictly in TOON format (no additional commentary).'
        : 'You are a helpful assistant.';

    // Construct Gemini payload with system_instruction and user content
    const payload = {
      system_instruction: {
        parts: [{ text: finalSystemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: finalPrompt }],
        },
      ],
    };

    // Gemini API endpoint (update model name/version if needed)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

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
          const respText = await response.text();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${respText}`);
        }

        const result = await response.json();

        // Safely extract candidate text
        const candidate = result?.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
          // No text produced — build meaningful error
          let errorText = 'No content generated.';
          if (candidate?.finishReason) errorText = `Generation failed: ${candidate.finishReason}`;
          if (result?.promptFeedback?.blockReason) errorText = `Prompt blocked: ${result.promptFeedback.blockReason}`;
          throw new Error(errorText);
        }

        // If the client requested TOON output and we have decode capability, try to decode safely
        if (forceToonOutput && toonModule && typeof toonModule.decode === 'function') {
          try {
            if (typeof text !== 'string') {
              console.warn('Model returned non-string text; returning raw result.');
              return res.json({ text: text || null, raw: result, tokenReport });
            }

            const decodedData = toonModule.decode(text);

            // Also estimate tokens for the returned TOON text and decoded JSON (if possible)
            tokenReport.response = {};
            tokenReport.response.toon = estimateTokens(text);
            try {
              const decodedJsonString = JSON.stringify(decodedData);
              tokenReport.response.decodedJson = estimateTokens(decodedJsonString);
            } catch (err) {
              tokenReport.response.decodedJson = null;
            }

            // If we have both toon and decodedJson sizes, compute savings
            if (tokenReport.response.toon && tokenReport.response.decodedJson) {
              const bytesExtra = tokenReport.response.decodedJson.bytes - tokenReport.response.toon.bytes;
              const tokensExtra = tokenReport.response.decodedJson.estimatedTokens - tokenReport.response.toon.estimatedTokens;
              tokenReport.response.savings = {
                bytesExtra,
                tokensExtra,
                percentCompact: tokenReport.response.decodedJson.bytes > 0 ? Math.round(((tokenReport.response.decodedJson.bytes - tokenReport.response.toon.bytes) / tokenReport.response.decodedJson.bytes) * 10000) / 100 : 0
              };
            }

            return res.json({ text, data: decodedData, tokenReport });
          } catch (decodeErr) {
            console.warn('Failed to decode model output as TOON — returning raw text:', decodeErr);
            // fall through to return raw text with tokenReport
            tokenReport.response = { toon: estimateTokens(text) };
            return res.json({ text, tokenReport });
          }
        }

        // Otherwise return raw text and responses token estimate
        tokenReport.response = { text: estimateTokens(text) };
        return res.json({ text, tokenReport });
      } catch (err) {
        console.warn(`Gemini attempt ${attempt + 1} failed:`, err?.message || err);
        if (attempt === maxRetries - 1) {
          return res.status(502).json({ error: err?.message || 'Failed to generate content', tokenReport });
        }
        // wait before retrying
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }

    // Shouldn't reach here
    return res.status(500).json({ error: 'Unhandled server error', tokenReport });
  } catch (topErr) {
    console.error('Unexpected error in /api/gemini:', topErr);
    return res.status(500).json({ error: 'Internal server error' });
  }
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
  const user = sess?.user;
  const sessionId = socket.request.sessionID;

  if (!user) {
    socket.disconnect(true);
    return;
  }

  clients.set(socket.id, { username: user.username, userId: user.id, sessionId, fullname: user.fullname });

  // broadcast active usernames with fullnames (unique)
  const usernames = Array.from(new Set(Array.from(clients.values()).map((u) => u.fullname || u.username)));
  io.emit('update-users', usernames);

  socket.on('user-message', (data) => {
    // Add timestamp to message
    const { DateTime } = require('luxon');
    const timestamp = DateTime.now().setZone('Asia/Kolkata').toISO();

    // Store message in database
    const userInfo = clients.get(socket.id);
    if (userInfo) {
      try {
        db.insertMessage({
          user_id: userInfo.userId,
          username: data.name,
          fullname: userInfo.fullname,
          message: data.message,
          message_type: 'text',
          timestamp,
        });
      } catch (err) {
        console.error('[MESSAGE] Failed to save message:', err.message || err);
      }
    }

    // Broadcast with timestamp
    io.emit('broadcast', { ...data, timestamp });
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('user-typing', { username: data.name });
  });

  socket.on('stop-typing', (data) => {
    socket.broadcast.emit('user-stop-typing', { username: data.name });
  });

  socket.on('disconnect', () => {
    const info = clients.get(socket.id);
    if (info && info.sessionId) {
      const { sessionId: sid, userId } = info;
      const { DateTime } = require('luxon');
      const now = DateTime.now().setZone('Asia/Kolkata').toISO();
      try {
        db.updateLogoutBySession(sid, now);
      } catch (err) {
        console.warn('Failed to update logout time in DB:', err?.message || err);
      }
    }
    clients.delete(socket.id);
    const remaining = Array.from(new Set(Array.from(clients.values()).map((u) => u.fullname || u.username)));
    io.emit('update-users', remaining);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is On — listening on port ${PORT}`));