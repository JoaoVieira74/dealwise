CREATE TABLE IF NOT EXISTS listings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  price       TEXT,
  location    TEXT,
  category    TEXT,
  image_url   TEXT,
  listing_url TEXT    NOT NULL,
  scraped_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, listing_url)
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  source  TEXT    NOT NULL,
  status  TEXT    NOT NULL,
  count   INTEGER DEFAULT 0,
  message TEXT,
  ran_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
