# MarketAggregator — Design Spec
**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

A web application that automatically scrapes listings from OLX Portugal and Facebook Marketplace Portugal every 30 minutes, stores them in a local SQLite database, and presents them in a unified feed on a single web page. Users can see at a glance which platform each listing comes from without having to visit multiple sites.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  SERVER (Node.js + Express)          │
│                                                      │
│  ┌──────────────┐    ┌─────────────────────────┐    │
│  │  Scheduler   │───▶│  Scraper: OLX Playwright│    │
│  │  (node-cron) │    └─────────────────────────┘    │
│  │  every 30min │    ┌─────────────────────────┐    │
│  │              │───▶│  Scraper: Facebook PW   │    │
│  └──────────────┘    └─────────────────────────┘    │
│          │                      │                    │
│          └──────────┬───────────┘                    │
│                     ▼                                │
│              ┌─────────────┐                         │
│              │  SQLite DB  │  (listings table)       │
│              └─────────────┘                         │
│                     │                                │
│              ┌─────────────┐                         │
│              │  REST API   │  GET /api/listings      │
│              │  (Express)  │  GET /api/status        │
│              └─────────────┘                         │
└─────────────────────┬───────────────────────────────┘
                      │
              ┌───────▼────────┐
              │  Frontend      │
              │  HTML/CSS/JS   │
              │  Card grid     │
              └────────────────┘
```

---

## Components

### 1. Scrapers (`src/scrapers/`)

**`olx.js`**
- Uses Playwright (headless Chromium) to navigate `https://www.olx.pt/ads/`
- Extracts from listing cards: title, price, location, category, image URL, listing URL
- Iterates through up to 3 pages to get a broad feed
- Returns array of normalised listing objects

**`facebook.js`**
- Uses Playwright to navigate `https://www.facebook.com/marketplace/portugal/`
- On first run: opens browser in **headed mode** so the user can log in manually; saves cookies to `facebook_cookies.json`
- On subsequent runs: loads saved cookies (headless), proceeds with scraping
- Extracts: title, price, location, image URL, listing URL
- If cookies are expired or login fails: logs warning, skips Facebook gracefully

### 2. Database (`src/db/`)

**`schema.sql`**
```sql
CREATE TABLE IF NOT EXISTS listings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT    NOT NULL,        -- 'olx' | 'facebook'
  title       TEXT    NOT NULL,
  price       TEXT,
  location    TEXT,
  category    TEXT,
  image_url   TEXT,
  listing_url TEXT    NOT NULL,
  scraped_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, listing_url)          -- no duplicates
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL,
  status     TEXT NOT NULL,            -- 'ok' | 'error'
  count      INTEGER DEFAULT 0,
  message    TEXT,
  ran_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**`database.js`**
- Opens/creates `market.db` via `better-sqlite3`
- Exports: `upsertListings(listings)`, `getListings(filters)`, `getLastScrapeStatus()`

### 3. Scheduler (`src/scheduler.js`)
- Uses `node-cron` to trigger both scrapers every 30 minutes
- Runs scrapers in parallel (`Promise.allSettled`)
- Calls `upsertListings` for each scraper's results
- Writes a row to `scrape_log` for each run (success or failure)
- On server start: runs one immediate scrape cycle

### 4. API (`src/api.js`)
- `GET /api/listings` — returns JSON array of listings; supports query params:
  - `source=olx|facebook` (optional filter)
  - `limit=N` (default 100)
- `GET /api/status` — returns last scrape time and count per source

### 5. Frontend (`public/`)

**`index.html`** — single page with:
- Header with logo and "última atualização" timestamp
- Filter bar: buttons for All / OLX / Facebook
- Card grid
- Footer with refresh button

**`app.js`**
- Fetches `/api/listings` on load and on filter change
- Renders card for each listing: image, title, price, location, source badge, "Ver artigo" link
- Auto-refreshes every 5 minutes
- Shows loading spinner during fetch

**`style.css`**
- Responsive grid (auto-fill, min 280px cards)
- OLX badge: purple (`#6e0ad6`)
- Facebook badge: blue (`#1877f2`)
- Dark/light neutral design

---

## Data Flow

1. Server starts → immediate scrape cycle triggered
2. `scheduler.js` calls `olx.js` and `facebook.js` in parallel
3. Each scraper returns `[{ source, title, price, location, category, image_url, listing_url }]`
4. `upsertListings` inserts new rows; `ON CONFLICT(source, listing_url) DO NOTHING` skips duplicates
5. `scrape_log` records result
6. User opens browser → `app.js` calls `GET /api/listings` → renders cards
7. Every 5 min: silent background refetch updates the feed

---

## Facebook Login Flow (first run)

```
npm start
  └─▶ facebook.js checks for facebook_cookies.json
        ├─ NOT FOUND: opens headed Chromium browser
        │    └─▶ user logs in manually
        │    └─▶ scraper saves cookies to facebook_cookies.json
        │    └─▶ continues scraping
        └─ FOUND: loads cookies (headless), scrapes normally
              └─ if login expired: logs warning, skips Facebook
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| OLX scraping fails | Log error to `scrape_log`, keep existing DB data, frontend shows stale data with timestamp |
| Facebook cookies expired | Log warning, skip Facebook, OLX continues normally |
| No data in DB yet (first start) | Frontend shows "A carregar dados..." spinner until first scrape completes |
| DB write conflict (duplicate URL) | Silently ignored via `ON CONFLICT DO NOTHING` |

---

## Project Structure

```
MarketAggregator/
├── src/
│   ├── scrapers/
│   │   ├── olx.js
│   │   └── facebook.js
│   ├── db/
│   │   ├── schema.sql
│   │   └── database.js
│   ├── scheduler.js
│   └── api.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── facebook_cookies.json   (gitignored, created on first run)
├── market.db               (gitignored, created on first run)
├── server.js
├── package.json
└── .gitignore
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Web framework | Express 4 |
| Browser automation | Playwright (Chromium) |
| Database | SQLite via `better-sqlite3` |
| Scheduler | `node-cron` |
| Frontend | Vanilla HTML/CSS/JS |

---

## Known Limitations

- **Facebook Marketplace scraping is fragile**: Facebook actively works against scrapers. Sessions expire, selectors change, and CAPTCHAs may appear. The system degrades gracefully (shows OLX only) when Facebook fails.
- **No search**: this version is a feed only (future: add keyword search against the DB).
- **No pagination in frontend**: shows the 100 most recent listings (future: infinite scroll).
