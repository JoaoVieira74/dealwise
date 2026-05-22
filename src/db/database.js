const fs = require('fs');
const path = require('path');

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const SOURCES = ['olx', 'facebook'];

const stmtCache = new WeakMap();

function initDb(db) {
  db.exec(schemaSql);
  // Migration: add featured_until column to existing databases
  const cols = db.prepare('PRAGMA table_info(listings)').all();
  if (!cols.some(c => c.name === 'featured_until')) {
    db.exec('ALTER TABLE listings ADD COLUMN featured_until DATETIME DEFAULT NULL');
  }
}

function upsertListings(db, listings) {
  if (!Array.isArray(listings)) throw new TypeError('listings must be an array');
  if (!stmtCache.has(db)) {
    stmtCache.set(db, db.prepare(`
      INSERT INTO listings (source, title, price, location, category, image_url, listing_url)
      VALUES (@source, @title, @price, @location, @category, @image_url, @listing_url)
      ON CONFLICT(source, listing_url) DO UPDATE SET
        title     = excluded.title,
        price     = excluded.price,
        location  = excluded.location,
        image_url = CASE
          WHEN excluded.image_url IS NOT NULL
           AND excluded.image_url NOT LIKE '%no_thumbnail%'
           AND excluded.image_url NOT LIKE '%static/media%'
          THEN excluded.image_url
          ELSE listings.image_url
        END
    `));
  }
  const stmt = stmtCache.get(db);
  db.transaction((items) => { for (const item of items) stmt.run(item); })(listings);
}

function getListings(db, { source = null, limit = 500, q = null } = {}) {
  const search = q ? `%${q}%` : null;
  return db.prepare(
    `SELECT * FROM listings
     WHERE (? IS NULL OR source = ?)
       AND (? IS NULL OR title LIKE ? OR location LIKE ?)
     ORDER BY id DESC LIMIT ?`
  ).all(source, source, search, search, search, limit);
}

function featureListing(db, source, listing_url, days) {
  db.prepare(
    `UPDATE listings SET featured_until = datetime('now', '+' || ? || ' days')
     WHERE source = ? AND listing_url = ?`
  ).run(String(days), source, listing_url);
}

function unfeatureListing(db, source, listing_url) {
  db.prepare(
    'UPDATE listings SET featured_until = NULL WHERE source = ? AND listing_url = ?'
  ).run(source, listing_url);
}

function logScrape(db, source, status, count, message) {
  db.prepare(
    'INSERT INTO scrape_log (source, status, count, message) VALUES (?, ?, ?, ?)'
  ).run(source, status, count, message);
}

function getLastScrapeStatus(db) {
  const result = {};
  for (const src of SOURCES) {
    result[src] = db.prepare(
      'SELECT * FROM scrape_log WHERE source = ? ORDER BY ran_at DESC LIMIT 1'
    ).get(src) ?? null;
  }
  return result;
}

module.exports = {
  SOURCES, initDb, upsertListings, getListings,
  featureListing, unfeatureListing, logScrape, getLastScrapeStatus,
};
