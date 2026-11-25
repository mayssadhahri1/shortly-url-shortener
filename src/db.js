// Accès à la base SQLite (fichier en production, mémoire pour les tests)
const Database = require('better-sqlite3');

function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      slug        TEXT PRIMARY KEY,
      url         TEXT NOT NULL,
      clicks      INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_click  TEXT,
      expires_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS clicks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      slug      TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
      day       TEXT NOT NULL DEFAULT (date('now')),
      referrer  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clicks_slug_day ON clicks(slug, day);
  `);
  db.pragma('foreign_keys = ON');

  // Requêtes préparées (plus rapides et protégées contre l'injection SQL)
  const q = {
    insert: db.prepare('INSERT INTO links (slug, url, expires_at) VALUES (?, ?, ?)'),
    get: db.prepare('SELECT * FROM links WHERE slug = ?'),
    recent: db.prepare('SELECT * FROM links ORDER BY created_at DESC, rowid DESC LIMIT ?'),
    remove: db.prepare('DELETE FROM links WHERE slug = ?'),
    hit: db.prepare("UPDATE links SET clicks = clicks + 1, last_click = datetime('now') WHERE slug = ?"),
    logClick: db.prepare('INSERT INTO clicks (slug, referrer) VALUES (?, ?)'),
    perDay: db.prepare(`
      SELECT day, COUNT(*) AS clicks FROM clicks
      WHERE slug = ? AND day >= date('now', '-6 days')
      GROUP BY day ORDER BY day`),
    referrers: db.prepare(`
      SELECT COALESCE(referrer, 'direct') AS source, COUNT(*) AS clicks FROM clicks
      WHERE slug = ? GROUP BY source ORDER BY clicks DESC LIMIT 5`),
  };

  // Un clic = compteur + historique, dans une seule transaction
  const recordClick = db.transaction((slug, referrer) => {
    q.hit.run(slug);
    q.logClick.run(slug, referrer);
  });

  return { db, q, recordClick };
}

module.exports = { openDb };
