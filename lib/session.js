const session = require('express-session');
const SQLiteStoreFactory = require('better-sqlite3-session-store');

module.exports = function createSessionMiddleware(db) {
  // Initialize store with the session library
  const SQLiteStore = SQLiteStoreFactory(session);

  const store = new SQLiteStore({ client: db.db });

  const sessionMiddleware = session({
    store,
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: false, // set true if running https
      sameSite: 'lax'
    }
  });

  return sessionMiddleware;
};
