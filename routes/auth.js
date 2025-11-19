const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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

// Forgot password - generate reset token
router.post('/forgot-password', (req, res) => {
  const { username } = req.body || {};
  if (!username || typeof username !== 'string') return res.status(400).json({ error: 'Username is required' });

  const user = db.getUserByUsername(username);
  if (!user) return res.status(404).json({ error: 'Username not found' });

  // Generate random token
  const token = crypto.randomBytes(32).toString('hex');
  const token_hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires_at = DateTime.now().setZone('Asia/Kolkata').plus({ minutes: 30 }).toISO();

  db.insertResetToken({ user_id: user.id, username: user.username, token, token_hash, expires_at });

  return res.json({ success: true, token, message: 'Password reset token generated. You have 30 minutes to use it.' });
});

// Reset password - validate token and update password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and password are required' });
  if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // Hash the token to look it up
  const token_hash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenRecord = db.getResetTokenByHash(token_hash);

  if (!tokenRecord) return res.status(401).json({ error: 'Invalid or expired token' });

  // Check if token has expired
  const now = DateTime.now().setZone('Asia/Kolkata');
  const expiresAt = DateTime.fromISO(tokenRecord.expires_at);
  if (now > expiresAt) return res.status(401).json({ error: 'Token has expired' });

  // Hash new password and update user
  const password_hash = await bcrypt.hash(newPassword, 10);
  db.updateUserPassword(tokenRecord.user_id, password_hash);

  // Mark token as used
  db.markResetTokenAsUsed(token_hash);

  return res.json({ success: true, message: 'Password reset successful. Please log in with your new password.' });
});

module.exports = router;
