const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// Recommended pragmas for concurrency
try { db.pragma('journal_mode = WAL'); } catch (e) { /* ignore */ }

// Create tables
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  fullname TEXT,
  email TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS login_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  fullname TEXT,
  session_id TEXT,
  login_time TEXT NOT NULL,
  logout_time TEXT,
  ip_address TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_login_logs_session_id ON login_logs(session_id);`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT NOT NULL,
  fullname TEXT,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON reset_tokens(user_id);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token_hash ON reset_tokens(token_hash);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires_at ON reset_tokens(expires_at);`).run();
module.exports = {
  db,
  getUserByUsername(username) {
    return db.prepare('SELECT id, username, password_hash, fullname, email, created_at, last_login_at FROM users WHERE username = ?').get(username);
  },
  createUser({ username, password_hash, fullname, email, created_at }) {
    const info = db.prepare('INSERT INTO users (username, password_hash, fullname, email, created_at) VALUES (?, ?, ?, ?, ?)').run(username, password_hash, fullname || null, email || null, created_at);
    return info.lastInsertRowid;
  },
  updateLastLogin(userId, lastLoginAt) {
    return db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(lastLoginAt, userId);
  },
  insertLoginLog({ user_id, username, fullname, session_id, login_time, ip_address }) {
    const info = db.prepare('INSERT INTO login_logs (user_id, username, fullname, session_id, login_time, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(user_id || null, username || null, fullname || null, session_id || null, login_time, ip_address || null);
    return info.lastInsertRowid;
  },
  updateLogoutBySession(session_id, logout_time) {
    return db.prepare('UPDATE login_logs SET logout_time = ? WHERE session_id = ? AND logout_time IS NULL').run(logout_time, session_id);
  },
  // fallback: update most recent open login by user id
  updateLogoutByUser(user_id, logout_time) {
    const row = db.prepare('SELECT id FROM login_logs WHERE user_id = ? AND logout_time IS NULL ORDER BY login_time DESC LIMIT 1').get(user_id);
    if (row && row.id) {
      return db.prepare('UPDATE login_logs SET logout_time = ? WHERE id = ?').run(logout_time, row.id);
    }
    return null;
  },
  insertMessage({ user_id, username, fullname, message, message_type, timestamp }) {
    const created_at = new Date().toISOString();
    const info = db.prepare('INSERT INTO messages (user_id, username, fullname, message, message_type, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user_id || null, username, fullname || username, message, message_type || 'text', timestamp, created_at);
    return info.lastInsertRowid;
  },
  getMessages(limit = 50, offset = 0) {
    return db.prepare('SELECT id, user_id, username, fullname, message, message_type, timestamp FROM messages ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
  },
  getMessagesSince(timestamp) {
    return db.prepare('SELECT id, user_id, username, fullname, message, message_type, timestamp FROM messages WHERE timestamp > ? ORDER BY timestamp ASC').all(timestamp);
  },
  insertResetToken({ user_id, username, token, token_hash, expires_at }) {
    const created_at = new Date().toISOString();
    const info = db.prepare('INSERT INTO reset_tokens (user_id, username, token, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(user_id, username, token, token_hash, expires_at, created_at);
    return info.lastInsertRowid;
  },
  getResetTokenByHash(token_hash) {
    return db.prepare('SELECT id, user_id, username, token_hash, expires_at, used_at FROM reset_tokens WHERE token_hash = ? AND used_at IS NULL').get(token_hash);
  },
  markResetTokenAsUsed(token_hash) {
    const used_at = new Date().toISOString();
    return db.prepare('UPDATE reset_tokens SET used_at = ? WHERE token_hash = ?').run(used_at, token_hash);
  },
  updateUserPassword(userId, passwordHash) {
    return db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  },
  cleanExpiredResetTokens() {
    const now = new Date().toISOString();
    return db.prepare('DELETE FROM reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL').run(now);
  }
};
