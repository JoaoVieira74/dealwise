const fs = require('fs');
const path = require('path');

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const SOURCES = ['olx', 'facebook'];

const stmtCache = new WeakMap();

function initDb(db) {
  db.exec(schemaSql);
}

function upsertListings(db, listings) {
  if (!Array.isArray(listings)) throw new TypeError('listings must be an array');
  if (!stmtCache.has(db)) {
    stmtCache.set(db, db.prepare(`
      INSERT OR IGNORE INTO listings (source, title, price, location, category, image_url, listing_url)
      VALUES (@source, @title, @price, @location, @category, @image_url, @listing_url)
    `));
  }
  const stmt = stmtCache.get(db);
  db.transaction((items) => { for (const item of items) stmt.run(item); })(listings);
}

function getListings(db, { source = null, limit = 100 } = {}) {
  return db.prepare(
    'SELECT * FROM listings WHERE (? IS NULL OR source = ?) ORDER BY scraped_at DESC LIMIT ?'
  ).all(source, source, limit);
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

module.exports = { initDb, upsertListings, getListings, logScrape, getLastScrapeStatus };
