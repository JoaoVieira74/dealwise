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
    await browser.close();
  }

  return listings;
}

module.exports = { scrapeOlx };
