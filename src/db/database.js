const fs = require('fs');
const path = require('path');

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function initDb(db) {
  db.exec(schemaSql);
}

function upsertListings(db, listings) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO listings (source, title, price, location, category, image_url, listing_url)
    VALUES (@source, @title, @price, @location, @category, @image_url, @listing_url)
  `);
  const insertMany = db.transaction((items) => {
    for (const item of items) stmt.run(item);
  });
  insertMany(listings);
}

function getListings(db, { source, limit = 100 } = {}) {
  if (source) {
    return db.prepare(
      'SELECT * FROM listings WHERE source = ? ORDER BY scraped_at DESC LIMIT ?'
    ).all(source, limit);
  }
  return db.prepare(
    'SELECT * FROM listings ORDER BY scraped_at DESC LIMIT ?'
  ).all(limit);
}

function logScrape(db, source, status, count, message) {
  db.prepare(
    'INSERT INTO scrape_log (source, status, count, message) VALUES (?, ?, ?, ?)'
  ).run(source, status, count, message);
}

function getLastScrapeStatus(db) {
  const result = {};
  for (const src of ['olx', 'facebook']) {
    result[src] = db.prepare(
      'SELECT * FROM scrape_log WHERE source = ? ORDER BY ran_at DESC LIMIT 1'
    ).get(src) ?? null;
  }
  return result;
}

module.exports = { initDb, upsertListings, getListings, logScrape, getLastScrapeStatus };
