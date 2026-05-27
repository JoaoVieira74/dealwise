const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

const OLX_URL = 'https://www.olx.pt/carros-motos-e-barcos/carros/';
const MAX_PAGES = 3;

async function scrapeOlx() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
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
      const url = pageNum === 1 ? OLX_URL : `${OLX_URL}?page=${pageNum}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Wait for consent dialog to appear, then dismiss it
      await page.waitForTimeout(3000);
      await page.click('[id*="onetrust-accept"], [id*="didomi-notice-agree"], button[data-cy="accept-cookies"]')
        .catch(() => null);
      await page.waitForTimeout(1000);

      await page.waitForSelector('[data-cy="l-card"]', { timeout: 30000 });

      // Scroll full page height to trigger all lazy-loaded images
      await page.evaluate(async () => {
        const total = document.body.scrollHeight;
        for (let y = 0; y < total; y += 300) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 150));
        }
      });
      await page.waitForTimeout(800);

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
            location:    locationEl ? locationEl.textContent.trim().split(' - ')[0].trim() : null,
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
    await browser.close().catch(() => null);
  }

  return listings;
}

module.exports = { scrapeOlx };
