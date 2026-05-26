const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

const BASE_URL = 'https://auto.sapo.pt/usados/carros/';
const MAX_PAGES = 3;

async function scrapeAutoSapo() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  });
  const page = await context.newPage();
  const listings = [];

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);

      await page.click('[id*="accept"], [id*="onetrust-accept"], button[class*="consent"]')
        .catch(() => null);
      await page.waitForTimeout(500);

      await page.waitForSelector('[class*="card"], [class*="listing"], article', { timeout: 20000 })
        .catch(() => null);

      const cards = await page.$$eval(
        '[class*="carCard"], [class*="car-card"], [class*="listing-card"], article',
        (els) => els.map((el) => {
          const linkEl = el.querySelector('a');
          const titleEl = el.querySelector('h2, h3, [class*="title"], [class*="name"], [class*="model"]');
          const priceEl = el.querySelector('[class*="price"], [class*="Price"]');
          const locationEl = el.querySelector('[class*="location"], [class*="city"], [class*="district"]');
          const imgEl = el.querySelector('img');

          const href = linkEl ? linkEl.href : null;
          if (!href || !href.includes('auto.sapo.pt')) return null;

          return {
            source: 'autosapo',
            title: titleEl ? titleEl.textContent.trim() : null,
            price: priceEl ? priceEl.textContent.trim() : null,
            location: locationEl ? locationEl.textContent.trim() : null,
            category: null,
            image_url: imgEl ? (imgEl.src || imgEl.dataset.src || null) : null,
            listing_url: href,
          };
        }).filter(Boolean)
      ).catch(() => []);

      listings.push(...cards.filter((c) => c.title && c.listing_url));

      const hasNext = await page.$('a[rel="next"], [class*="next-page"], [aria-label*="próxima"]');
      if (!hasNext) break;
    }
  } catch (err) {
    console.error('[autosapo] Scrape failed:', err.message);
  } finally {
    await browser.close();
  }

  console.log(`[autosapo] Found ${listings.length} listings`);
  return listings;
}

module.exports = { scrapeAutoSapo };
