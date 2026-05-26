const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

const BASE_URL = 'https://www.carroja.pt/carros-usados/';
const MAX_PAGES = 3;

async function scrapeCarroJa() {
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
      const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?pagina=${pageNum}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);

      await page.click('[id*="accept"], button[class*="accept"], [class*="cookie-accept"]')
        .catch(() => null);
      await page.waitForTimeout(500);

      await page.waitForSelector('[class*="card"], [class*="listing"], article, .car-item', { timeout: 20000 })
        .catch(() => null);

      const cards = await page.$$eval(
        '[class*="car-card"], [class*="car-item"], [class*="listing-item"], article',
        (els) => els.map((el) => {
          const linkEl = el.querySelector('a');
          const titleEl = el.querySelector('h2, h3, [class*="title"], [class*="name"]');
          const priceEl = el.querySelector('[class*="price"], [class*="Price"], [class*="valor"]');
          const locationEl = el.querySelector('[class*="location"], [class*="city"], [class*="localidade"]');
          const imgEl = el.querySelector('img');

          const href = linkEl ? linkEl.href : null;
          if (!href || !href.includes('carroja.pt')) return null;

          return {
            source: 'carroja',
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

      const hasNext = await page.$('a[rel="next"], [class*="next"], [aria-label*="próxima"]');
      if (!hasNext) break;
    }
  } catch (err) {
    console.error('[carroja] Scrape failed:', err.message);
  } finally {
    await browser.close();
  }

  console.log(`[carroja] Found ${listings.length} listings`);
  return listings;
}

module.exports = { scrapeCarroJa };
