const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { DateTime } = require('luxon');
const db = require('../lib/db');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || null;
}

// Signup
router.post('/signup', async (req, res) => {
  const { username, password, fullname, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid input' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.getUserByUsername(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const password_hash = await bcrypt.hash(password, 10);
  const now = DateTime.now().setZone('Asia/Kolkata').toISO();
  const id = db.createUser({ username, password_hash, fullname, email, created_at: now });

  return res.status(201).json({ user: { id, username, fullname: fullname || null } });
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

  const user = db.getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  // Set session
  req.session.user = { id: user.id, username: user.username, fullname: user.fullname };

  // Update last login and create login log
  const now = DateTime.now().setZone('Asia/Kolkata').toISO();
  db.updateLastLogin(user.id, now);

  const sessionId = req.sessionID;
  const ip = getClientIp(req);
  db.insertLoginLog({ user_id: user.id, username: user.username, fullname: user.fullname, session_id: sessionId, login_time: now, ip_address: ip });

  return res.json({ user: { id: user.id, username: user.username, fullname: user.fullname } });
});

// Logout
router.post('/logout', (req, res) => {
  if (!req.session || !req.session.user) return res.status(200).json({ success: true });
  const sessionId = req.sessionID;
  const now = DateTime.now().setZone('Asia/Kolkata').toISO();
  db.updateLogoutBySession(sessionId, now);

  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Failed to destroy session' });
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// Current user
router.get('/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  return res.status(401).json({ error: 'Not authenticated' });
});

module.exports = router;
