CREATE TABLE IF NOT EXISTS listings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source         TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  price          TEXT,
  location       TEXT,
  category       TEXT,
  image_url      TEXT,
  listing_url    TEXT    NOT NULL,
  contact_url    TEXT,
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

CREATE TABLE IF NOT EXISTS dealers (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  token                  TEXT    UNIQUE NOT NULL,
  company                TEXT    NOT NULL,
  contact_name           TEXT    NOT NULL,
  email                  TEXT    NOT NULL,
  phone                  TEXT,
  plan                   TEXT    NOT NULL,
  car_limit              INTEGER NOT NULL,
  status                 TEXT    DEFAULT 'pending',
  stripe_session_id      TEXT,
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  created_at             DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dealer_cars (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id   INTEGER NOT NULL REFERENCES dealers(id),
  listing_url TEXT    NOT NULL UNIQUE,
  created_at  DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  source  TEXT    NOT NULL,
  status  TEXT    NOT NULL,
  count   INTEGER DEFAULT 0,
  message TEXT,
  ran_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
