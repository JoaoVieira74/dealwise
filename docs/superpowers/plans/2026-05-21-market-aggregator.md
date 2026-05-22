# MarketAggregator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js web app that scrapes OLX Portugal and Facebook Marketplace Portugal every 30 minutes and presents all listings in a unified card-feed on a single web page.

**Architecture:** An Express server hosts a REST API backed by SQLite (via better-sqlite3). Two Playwright scrapers run on a node-cron schedule and upsert results into the DB. A vanilla HTML/CSS/JS frontend polls the API every 5 minutes and renders cards with per-source badges.

**Tech Stack:** Node.js 20+, Express 4, Playwright (Chromium), better-sqlite3, node-cron, Jest + Supertest (tests)

---

## File Map

```
MarketAggregator/
├── src/
│   ├── scrapers/
│   │   ├── olx.js          — Playwright scraper for OLX Portugal
│   │   └── facebook.js     — Playwright scraper for Facebook Marketplace (cookie session)
│   ├── db/
│   │   ├── schema.sql      — CREATE TABLE statements
│   │   └── database.js     — initDb, upsertListings, getListings, logScrape, getLastScrapeStatus
│   ├── scheduler.js        — node-cron job, runs scrapers, saves results
│   └── api.js              — Express app factory: GET /api/listings, GET /api/status
├── public/
│   ├── index.html          — single page shell
│   ├── style.css           — responsive card grid, badges
│   └── app.js              — fetch, render cards, filters, auto-refresh
├── tests/
│   ├── db.test.js          — unit tests for database.js
│   └── api.test.js         — integration tests for api.js (supertest)
├── facebook_cookies.json   — gitignored, created on first Facebook login
├── market.db               — gitignored, created on first run
├── server.js               — entry point: wires DB + API + scheduler
├── package.json
└── .gitignore
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `server.js` (empty placeholder)

- [ ] **Step 1: Create project folder and initialise npm**

```bash
cd "C:\Users\joaov\Desktop\Trabalho\Projetos\MarketAggregator"
npm init -y
```

- [ ] **Step 2: Install production dependencies**

```bash
npm install express better-sqlite3 playwright node-cron
```

- [ ] **Step 3: Install Playwright's Chromium browser**

```bash
npx playwright install chromium
```

- [ ] **Step 4: Install dev dependencies**

```bash
npm install --save-dev jest supertest
```

- [ ] **Step 5: Update package.json scripts**

In `package.json`, replace the `"scripts"` section with:

```json
"scripts": {
  "start": "node server.js",
  "test": "jest --runInBand"
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
market.db
facebook_cookies.json
```

- [ ] **Step 7: Create empty server.js**

```js
// entry point — implemented in Task 8
```

- [ ] **Step 8: git init and first commit**

```bash
git init
git add package.json package-lock.json .gitignore server.js
git commit -m "chore: project setup"
```

---

## Task 2: Database Module

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/database.js`
- Create: `tests/db.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/db.test.js`:

```js
const Database = require('better-sqlite3');
const { initDb, upsertListings, getListings, logScrape, getLastScrapeStatus } = require('../src/db/database');

function makeDb() {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

describe('upsertListings', () => {
  test('inserts new listing', () => {
    const db = makeDb();
    upsertListings(db, [{
      source: 'olx', title: 'iPhone 14', price: '800€',
      location: 'Lisboa', category: 'Electrónica',
      image_url: 'https://example.com/img.jpg',
      listing_url: 'https://olx.pt/ad/1'
    }]);
    const rows = db.prepare('SELECT * FROM listings').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('iPhone 14');
    db.close();
  });

  test('ignores duplicate listing_url per source', () => {
    const db = makeDb();
    const listing = {
      source: 'olx', title: 'A', price: null, location: null,
      category: null, image_url: null, listing_url: 'https://olx.pt/ad/1'
    };
    upsertListings(db, [listing]);
    upsertListings(db, [listing]);
    const count = db.prepare('SELECT COUNT(*) as c FROM listings').get().c;
    expect(count).toBe(1);
    db.close();
  });
});

describe('getListings', () => {
  test('returns all listings when no filter', () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    expect(getListings(db, {})).toHaveLength(2);
    db.close();
  });

  test('filters by source', () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    const rows = getListings(db, { source: 'olx' });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('olx');
    db.close();
  });

  test('respects limit', () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx', title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'olx', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/2' },
      { source: 'olx', title: 'C', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/3' },
    ]);
    expect(getListings(db, { limit: 2 })).toHaveLength(2);
    db.close();
  });
});

describe('logScrape / getLastScrapeStatus', () => {
  test('records a scrape log and retrieves it', () => {
    const db = makeDb();
    logScrape(db, 'olx', 'ok', 42, null);
    const status = getLastScrapeStatus(db);
    expect(status.olx.status).toBe('ok');
    expect(status.olx.count).toBe(42);
    db.close();
  });

  test('returns null for source with no logs', () => {
    const db = makeDb();
    const status = getLastScrapeStatus(db);
    expect(status.olx).toBeNull();
    expect(status.facebook).toBeNull();
    db.close();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- tests/db.test.js
```
Expected: `Cannot find module '../src/db/database'`

- [ ] **Step 3: Create schema.sql**

Create `src/db/schema.sql`:

```sql
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
```

- [ ] **Step 4: Implement database.js**

Create `src/db/database.js`:

```js
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
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm test -- tests/db.test.js
```
Expected: all 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/db/database.js tests/db.test.js
git commit -m "feat: database module with schema, upsert, query, and scrape logging"
```

---

## Task 3: REST API

**Files:**
- Create: `src/api.js`
- Create: `tests/api.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/api.test.js`:

```js
const request = require('supertest');
const Database = require('better-sqlite3');
const { initDb, upsertListings, logScrape } = require('../src/db/database');
const { createApp } = require('../src/api');

function makeDb() {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

describe('GET /api/listings', () => {
  test('returns empty array when no listings', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/listings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    db.close();
  });

  test('returns all listings', async () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'Car',  price: '5000€', location: 'Porto',  category: 'Veículos', image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'Bike', price: '200€',  location: 'Lisboa', category: null,       image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    const res = await request(createApp(db)).get('/api/listings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    db.close();
  });

  test('filters by source=olx', async () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'Car',  price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'Bike', price: null, location: null, category: null, image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    const res = await request(createApp(db)).get('/api/listings?source=olx');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe('olx');
    db.close();
  });

  test('rejects invalid source param with 400', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/listings?source=twitter');
    expect(res.status).toBe(400);
    db.close();
  });
});

describe('GET /api/status', () => {
  test('returns null for both sources when no scrapes have run', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.olx).toBeNull();
    expect(res.body.facebook).toBeNull();
    db.close();
  });

  test('returns last scrape status after a scrape log entry', async () => {
    const db = makeDb();
    logScrape(db, 'olx', 'ok', 50, null);
    const res = await request(createApp(db)).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.olx.status).toBe('ok');
    expect(res.body.olx.count).toBe(50);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- tests/api.test.js
```
Expected: `Cannot find module '../src/api'`

- [ ] **Step 3: Implement api.js**

Create `src/api.js`:

```js
const express = require('express');
const path = require('path');
const { getListings, getLastScrapeStatus } = require('./db/database');

function createApp(db) {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/listings', (req, res) => {
    const { source, limit } = req.query;
    if (source && !['olx', 'facebook'].includes(source)) {
      return res.status(400).json({ error: 'source must be "olx" or "facebook"' });
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    res.json(getListings(db, { source, limit: parsedLimit }));
  });

  app.get('/api/status', (req, res) => {
    res.json(getLastScrapeStatus(db));
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- tests/api.test.js
```
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/api.js tests/api.test.js
git commit -m "feat: REST API with /api/listings and /api/status endpoints"
```

---

## Task 4: OLX Scraper

**Files:**
- Create: `src/scrapers/olx.js`

Note: Playwright scrapers make real HTTP requests — no automated tests. Manual verification via a temp script.

- [ ] **Step 1: Implement olx.js**

Create `src/scrapers/olx.js`:

```js
const { chromium } = require('playwright');

const OLX_URL = 'https://www.olx.pt/ads/';
const MAX_PAGES = 3;

async function scrapeOlx() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const listings = [];

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = pageNum === 1 ? OLX_URL : `${OLX_URL}?page=${pageNum}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[data-cy="l-card"]', { timeout: 15000 });

      const cards = await page.$$eval('[data-cy="l-card"]', (els) =>
        els.map((el) => {
          const titleEl =
            el.querySelector('[data-cy="ad-title"]') ||
            el.querySelector('h4') ||
            el.querySelector('h6');
          const priceEl =
            el.querySelector('[data-testid="ad-price"]') ||
            el.querySelector('.price');
          const locationEl =
            el.querySelector('[data-testid="location-date"]') ||
            el.querySelector('p');
          const imgEl  = el.querySelector('img');
          const linkEl = el.querySelector('a');

          return {
            source:      'olx',
            title:       titleEl    ? titleEl.textContent.trim() : null,
            price:       priceEl    ? priceEl.textContent.trim() : null,
            location:    locationEl ? locationEl.textContent.trim().split('\n')[0] : null,
            category:    null,
            image_url:   imgEl      ? (imgEl.src || imgEl.dataset.src || null) : null,
            listing_url: linkEl     ? linkEl.href : null,
          };
        })
      );

      listings.push(...cards.filter((c) => c.title && c.listing_url));

      const hasNext = await page.$('[data-testid="pagination-forward"]');
      if (!hasNext) break;
    }
  } finally {
    await browser.close();
  }

  return listings;
}

module.exports = { scrapeOlx };
```

- [ ] **Step 2: Create temp test script and run it**

Create `test-olx.js` in the project root:

```js
const { scrapeOlx } = require('./src/scrapers/olx');
scrapeOlx()
  .then((listings) => {
    console.log(`Found ${listings.length} OLX listings`);
    console.log(JSON.stringify(listings.slice(0, 3), null, 2));
  })
  .catch(console.error);
```

```bash
node test-olx.js
```

Expected: prints 10+ listings. Each has a non-null `title` and `listing_url`.

If 0 results are returned: open `https://www.olx.pt/ads/` in Chrome DevTools, inspect the card HTML, and update the selectors in `src/scrapers/olx.js` to match the actual `data-cy` or class names shown in the DOM.

- [ ] **Step 3: Delete temp script**

```bash
del test-olx.js
```

- [ ] **Step 4: Commit**

```bash
git add src/scrapers/olx.js
git commit -m "feat: OLX Portugal Playwright scraper"
```

---

## Task 5: Facebook Marketplace Scraper

**Files:**
- Create: `src/scrapers/facebook.js`

Note: First run opens a headed browser for manual login. Subsequent runs are headless using saved cookies.

- [ ] **Step 1: Implement facebook.js**

Create `src/scrapers/facebook.js`:

```js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE    = path.join(__dirname, '..', '..', 'facebook_cookies.json');
const MARKETPLACE_URL = 'https://www.facebook.com/marketplace/portugal/';

async function extractListings(page) {
  await page.waitForTimeout(3000);
  return page.$$eval('a[href*="/marketplace/item/"]', (els) =>
    els.map((el) => {
      const img   = el.querySelector('img');
      const spans = Array.from(el.querySelectorAll('span'))
        .map((s) => s.textContent.trim())
        .filter(Boolean);
      const price = spans.find((t) => /\d/.test(t) && (t.includes('€') || t.toLowerCase().includes('grát'))) || null;
      return {
        source:      'facebook',
        title:       img ? img.alt : (spans[0] || null),
        price,
        location:    spans[spans.length - 1] || null,
        category:    null,
        image_url:   img ? img.src : null,
        listing_url: el.href,
      };
    })
  ).catch(() => []);
}

async function isLoggedOut(page) {
  const url = page.url();
  if (url.includes('/login') || url.includes('/checkpoint')) return true;
  const loginBtn = await page.$('[data-testid="royal_login_button"]');
  return loginBtn !== null;
}

async function loginAndSaveCookies() {
  console.log('[facebook] No saved session. Opening browser — please log in to Facebook, then wait.');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/facebook\.com\/(home|$|\?)/, { timeout: 120000 });

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log('[facebook] Session saved.');
  await browser.close();
}

async function scrapeFacebook() {
  if (!fs.existsSync(COOKIES_FILE)) {
    await loginAndSaveCookies();
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
  await context.addCookies(cookies);

  const page = await context.newPage();
  try {
    await page.goto(MARKETPLACE_URL, { waitUntil: 'networkidle', timeout: 60000 });

    if (await isLoggedOut(page)) {
      console.warn('[facebook] Session expired. Delete facebook_cookies.json and restart to re-login.');
      return [];
    }

    const listings = await extractListings(page);
    const valid    = listings.filter((l) => l.title && l.listing_url);

    const freshCookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(freshCookies, null, 2));

    return valid;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeFacebook };
```

- [ ] **Step 2: Create temp test script and run it**

Create `test-fb.js`:

```js
const { scrapeFacebook } = require('./src/scrapers/facebook');
scrapeFacebook()
  .then((listings) => {
    console.log(`Found ${listings.length} Facebook listings`);
    console.log(JSON.stringify(listings.slice(0, 3), null, 2));
  })
  .catch(console.error);
```

```bash
node test-fb.js
```

First run: browser opens. Log in to Facebook. Browser closes automatically after login is detected. Script then prints listings.

Subsequent runs: headless, prints listings directly.

If 0 listings: open `https://www.facebook.com/marketplace/portugal/` in Chrome DevTools and find the `<a>` elements wrapping listing cards. Update the `$$eval` selector in `src/scrapers/facebook.js` to match the actual `href` pattern.

- [ ] **Step 3: Delete temp script**

```bash
del test-fb.js
```

- [ ] **Step 4: Commit**

```bash
git add src/scrapers/facebook.js
git commit -m "feat: Facebook Marketplace scraper with cookie-based session persistence"
```

---

## Task 6: Scheduler

**Files:**
- Create: `src/scheduler.js`

- [ ] **Step 1: Implement scheduler.js**

Create `src/scheduler.js`:

```js
const cron = require('node-cron');
const { scrapeOlx }     = require('./scrapers/olx');
const { scrapeFacebook } = require('./scrapers/facebook');
const { upsertListings, logScrape } = require('./db/database');

async function runScrapeJob(db) {
  console.log('[scheduler] Starting scrape cycle...');

  const [olxResult, fbResult] = await Promise.allSettled([
    scrapeOlx(),
    scrapeFacebook(),
  ]);

  if (olxResult.status === 'fulfilled') {
    upsertListings(db, olxResult.value);
    logScrape(db, 'olx', 'ok', olxResult.value.length, null);
    console.log(`[scheduler] OLX: ${olxResult.value.length} listings saved`);
  } else {
    logScrape(db, 'olx', 'error', 0, olxResult.reason?.message ?? 'unknown');
    console.error('[scheduler] OLX failed:', olxResult.reason);
  }

  if (fbResult.status === 'fulfilled') {
    upsertListings(db, fbResult.value);
    logScrape(db, 'facebook', 'ok', fbResult.value.length, null);
    console.log(`[scheduler] Facebook: ${fbResult.value.length} listings saved`);
  } else {
    logScrape(db, 'facebook', 'error', 0, fbResult.reason?.message ?? 'unknown');
    console.error('[scheduler] Facebook failed:', fbResult.reason);
  }

  console.log('[scheduler] Scrape cycle complete.');
}

function startScheduler(db) {
  runScrapeJob(db);
  cron.schedule('*/30 * * * *', () => runScrapeJob(db));
}

module.exports = { startScheduler };
```

- [ ] **Step 2: Commit**

```bash
git add src/scheduler.js
git commit -m "feat: node-cron scheduler — scrapes OLX + Facebook every 30 minutes"
```

---

## Task 7: Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

- [ ] **Step 1: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MarketAggregator</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header>
    <h1>MarketAggregator</h1>
    <p id="last-updated">A carregar...</p>
  </header>

  <nav class="filters">
    <button class="filter-btn active" data-source="">Todos</button>
    <button class="filter-btn" data-source="olx">OLX</button>
    <button class="filter-btn" data-source="facebook">Facebook</button>
    <button id="refresh-btn">Atualizar</button>
  </nav>

  <main id="listings-grid" class="grid">
    <div class="spinner">A carregar artigos...</div>
  </main>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/style.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, sans-serif;
  background: #f4f4f6;
  color: #1a1a2e;
  min-height: 100vh;
}

header {
  background: #1a1a2e;
  color: white;
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
header h1 { font-size: 1.5rem; }
header p  { font-size: 0.8rem; opacity: 0.6; }

.filters {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 2rem;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.4rem 1rem;
  border: 1px solid #ccc;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.15s;
}
.filter-btn.active        { background: #1a1a2e; color: white; border-color: #1a1a2e; }
.filter-btn:hover:not(.active) { background: #f0f0f0; }

#refresh-btn {
  margin-left: auto;
  padding: 0.4rem 1rem;
  border: 1px solid #1a1a2e;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}
#refresh-btn:hover { background: #1a1a2e; color: white; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  padding: 1.5rem 2rem;
}

.card {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  transition: transform 0.15s, box-shadow 0.15s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }

.card-img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  background: #e0e0e0;
}
.card-img-placeholder {
  width: 100%;
  height: 180px;
  background: linear-gradient(135deg, #e0e0e0, #ccc);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 2rem;
}

.card-body {
  padding: 0.9rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.card-title    { font-size: 0.95rem; font-weight: 600; line-height: 1.3; }
.card-price    { font-size: 1rem; font-weight: 700; }
.card-location { font-size: 0.78rem; color: #666; }

.card-footer {
  padding: 0.75rem 0.9rem;
  border-top: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-olx      { background: #6e0ad6; color: white; }
.badge-facebook { background: #1877f2; color: white; }

.card-link {
  font-size: 0.8rem;
  color: #1a1a2e;
  text-decoration: none;
  font-weight: 600;
  border: 1px solid #1a1a2e;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
}
.card-link:hover { background: #1a1a2e; color: white; }

.spinner    { grid-column: 1/-1; text-align: center; padding: 3rem; color: #666; }
.no-results { grid-column: 1/-1; text-align: center; padding: 3rem; color: #999; }

@media (max-width: 600px) {
  header { flex-direction: column; gap: 0.5rem; text-align: center; }
  .grid  { padding: 1rem; gap: 0.75rem; }
}
```

- [ ] **Step 3: Create public/app.js**

```js
(function () {
  let activeSource = '';
  const grid        = document.getElementById('listings-grid');
  const lastUpdated = document.getElementById('last-updated');

  function formatTime(isoString) {
    if (!isoString) return 'desconhecida';
    return new Date(isoString).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  }

  function renderCard(l) {
    const badgeClass = l.source === 'olx' ? 'badge-olx' : 'badge-facebook';
    const badgeLabel = l.source === 'olx' ? 'OLX' : 'Facebook';
    const imgTag     = l.image_url
      ? `<img class="card-img" src="${l.image_url}" alt="${l.title}" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholder = `<div class="card-img-placeholder" ${l.image_url ? 'style="display:none"' : ''}>📦</div>`;

    return `
      <article class="card">
        ${imgTag}${placeholder}
        <div class="card-body">
          <div class="card-title">${l.title}</div>
          ${l.price    ? `<div class="card-price">${l.price}</div>`       : ''}
          ${l.location ? `<div class="card-location">📍 ${l.location}</div>` : ''}
        </div>
        <div class="card-footer">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <a class="card-link" href="${l.listing_url}" target="_blank" rel="noopener">Ver artigo</a>
        </div>
      </article>`;
  }

  async function loadListings() {
    const url = activeSource ? `/api/listings?source=${activeSource}` : '/api/listings';
    grid.innerHTML = '<div class="spinner">A carregar...</div>';

    try {
      const [listRes, statusRes] = await Promise.all([fetch(url), fetch('/api/status')]);
      const listings = await listRes.json();
      const status   = await statusRes.json();

      grid.innerHTML = listings.length
        ? listings.map(renderCard).join('')
        : '<p class="no-results">Nenhum artigo encontrado. Aguarda o próximo ciclo de scraping.</p>';

      const lastRun = status.olx?.ran_at || status.facebook?.ran_at;
      lastUpdated.textContent = `Última atualização: ${formatTime(lastRun)}`;
    } catch {
      grid.innerHTML = '<p class="no-results">Erro ao carregar artigos. O servidor está a correr?</p>';
    }
  }

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeSource = btn.dataset.source;
      loadListings();
    });
  });

  document.getElementById('refresh-btn').addEventListener('click', loadListings);

  loadListings();
  setInterval(loadListings, 5 * 60 * 1000);
})();
```

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "feat: frontend card feed with source filters and 5-minute auto-refresh"
```

---

## Task 8: Server Entry Point + Final Verification

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Implement server.js**

Replace the placeholder content of `server.js` with:

```js
const Database        = require('better-sqlite3');
const path            = require('path');
const { initDb }      = require('./src/db/database');
const { createApp }   = require('./src/api');
const { startScheduler } = require('./src/scheduler');

const DB_PATH = path.join(__dirname, 'market.db');
const PORT    = process.env.PORT || 3000;

const db  = new Database(DB_PATH);
initDb(db);

const app = createApp(db);
startScheduler(db);

app.listen(PORT, () => {
  console.log(`MarketAggregator running at http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```
Expected: all 11 tests PASS (6 db + 5 api)

- [ ] **Step 3: Start the server**

```bash
npm start
```

Expected console output:
```
MarketAggregator running at http://localhost:3000
[scheduler] Starting scrape cycle...
[scheduler] OLX: N listings saved
[scheduler] Facebook: N listings saved   ← or login prompt on first run
[scheduler] Scrape cycle complete.
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3000`.

Verify:
- Card grid renders with OLX listings (purple badge)
- Facebook listings appear (blue badge) if session was set up
- Filter buttons (Todos / OLX / Facebook) update the displayed cards
- "Última atualização" timestamp shows in the header
- "Ver artigo" links open the original listing in a new tab

- [ ] **Step 5: Final commit**

```bash
git add server.js
git commit -m "feat: wire server entry point — DB + API + scheduler ready"
```
