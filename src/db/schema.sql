CREATE TABLE IF NOT EXISTS listings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source         TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  price          TEXT,
  location       TEXT,
  category       TEXT,
  image_url      TEXT,
  listing_url    TEXT    NOT NULL,
  scraped_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  featured_until DATETIME DEFAULT NULL,
  UNIQUE(source, listing_url)
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT    UNIQUE NOT NULL,
  source       TEXT    NOT NULL,
  listing_url  TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  days         INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status       TEXT    DEFAULT 'pending',
  created_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  source  TEXT    NOT NULL,
  status  TEXT    NOT NULL,
  count   INTEGER DEFAULT 0,
  message TEXT,
  ran_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
