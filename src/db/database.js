const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const SOURCES = ['olx', 'facebook', 'standvirtual', 'custojusto', 'autosapo', 'dealer'];

const stmtCache = new WeakMap();

function initDb(db) {
  db.exec(schemaSql);

  // Migrations for existing databases
  const cols = db.prepare('PRAGMA table_info(listings)').all();
  if (!cols.some(c => c.name === 'featured_until')) {
    db.exec('ALTER TABLE listings ADD COLUMN featured_until DATETIME DEFAULT NULL');
  }
  if (!cols.some(c => c.name === 'contact_url')) {
    db.exec('ALTER TABLE listings ADD COLUMN contact_url TEXT DEFAULT NULL');
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

// ── Payments ────────────────────────────────────────────────────────────────

function createPayment(db, sessionId, source, listingUrl, email, days, amountCents) {
  db.prepare(
    `INSERT OR IGNORE INTO payments (session_id, source, listing_url, email, days, amount_cents)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, source, listingUrl, email, days, amountCents);
}

function completePayment(db, sessionId) {
  db.prepare(`UPDATE payments SET status = 'paid' WHERE session_id = ?`).run(sessionId);
}

// ── Dealers ─────────────────────────────────────────────────────────────────

function createDealer(db, { company, contactName, email, phone, plan, carLimit }) {
  const token = randomUUID();
  db.prepare(`
    INSERT INTO dealers (token, company, contact_name, email, phone, plan, car_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, company, contactName, email, phone || null, plan, carLimit);
  return token;
}

function getDealerByToken(db, token) {
  return db.prepare('SELECT * FROM dealers WHERE token = ?').get(token) ?? null;
}

function getDealerBySessionId(db, sessionId) {
  return db.prepare('SELECT * FROM dealers WHERE stripe_session_id = ?').get(sessionId) ?? null;
}

function setDealerSession(db, token, sessionId) {
  db.prepare('UPDATE dealers SET stripe_session_id = ? WHERE token = ?').run(sessionId, token);
}

function activateDealer(db, token, subscriptionId, customerId) {
  db.prepare(`
    UPDATE dealers SET status = 'active', stripe_subscription_id = ?, stripe_customer_id = ?
    WHERE token = ?
  `).run(subscriptionId || null, customerId || null, token);
}

function getDealerCars(db, dealerId) {
  return db.prepare(`
    SELECT dc.id, dc.listing_url, dc.created_at,
           l.title, l.price, l.location, l.image_url, l.contact_url
    FROM dealer_cars dc
    JOIN listings l ON l.listing_url = dc.listing_url AND l.source = 'dealer'
    WHERE dc.dealer_id = ?
    ORDER BY dc.id DESC
  `).all(dealerId);
}

function addDealerCar(db, dealerId, { title, price, location, imageUrl, contactUrl }) {
  const listingUrl = `dealer-car-${randomUUID()}`;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO listings (source, title, price, location, image_url, listing_url, contact_url)
      VALUES ('dealer', ?, ?, ?, ?, ?, ?)
    `).run(title, price || null, location || null, imageUrl || null, listingUrl, contactUrl || null);
    db.prepare('INSERT INTO dealer_cars (dealer_id, listing_url) VALUES (?, ?)').run(dealerId, listingUrl);
  })();
  return listingUrl;
}

function removeDealerCar(db, carId, dealerId) {
  const car = db.prepare('SELECT listing_url FROM dealer_cars WHERE id = ? AND dealer_id = ?').get(carId, dealerId);
  if (!car) return false;
  db.transaction(() => {
    db.prepare("DELETE FROM listings WHERE source = 'dealer' AND listing_url = ?").run(car.listing_url);
    db.prepare('DELETE FROM dealer_cars WHERE id = ?').run(carId);
  })();
  return true;
}

// ── Scrape log ───────────────────────────────────────────────────────────────

function logScrape(db, source, status, count, message) {
  db.prepare(
    'INSERT INTO scrape_log (source, status, count, message) VALUES (?, ?, ?, ?)'
  ).run(source, status, count, message);
}

function getLastScrapeStatus(db) {
  const result = {};
  for (const src of ['olx', 'facebook', 'standvirtual']) {
    result[src] = db.prepare(
      'SELECT * FROM scrape_log WHERE source = ? ORDER BY ran_at DESC LIMIT 1'
    ).get(src) ?? null;
  }
  return result;
}

module.exports = {
  SOURCES, initDb, upsertListings, getListings,
  featureListing, unfeatureListing,
  logScrape, getLastScrapeStatus,
  createPayment, completePayment,
  createDealer, getDealerByToken, getDealerBySessionId,
  setDealerSession, activateDealer,
  getDealerCars, addDealerCar, removeDealerCar,
};
