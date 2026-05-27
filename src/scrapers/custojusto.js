const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

const BASE_URL = 'https://www.custojusto.pt/portugal/veiculos/carros-usados';
const MAX_PAGES = 3;

async function scrapeCustoJusto() {
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
      const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?o=${(pageNum - 1) * 40}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000);

      // Remove CybotCookiebot consent overlay
      await page.evaluate(() => {
        document.getElementById('CybotCookiebotDialog')?.remove();
        document.getElementById('CybotCookiebotDialogBodyUnderlay')?.remove();
        document.body.style.overflow = 'auto';
      });
      await page.waitForTimeout(500);

      // Scroll to trigger lazy-loaded cards
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 100));
        }
      });
      await page.waitForTimeout(1000);

      const cards = await page.$$eval('a.tw-group[href*="veiculos"]', (els) =>
        els.map((el) => {
          const titleEl = el.querySelector('h2, h3');
          const imgEl   = el.querySelector('img');
          const lines   = (el.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);

          // Find price line (contains €)
          const priceIdx = lines.findLastIndex ? lines.findLastIndex(l => l.includes('€')) : (() => { let i = -1; lines.forEach((l,j) => { if (l.includes('€')) i = j; }); return i; })();
          const price    = priceIdx >= 0 ? lines[priceIdx] : null;
          // Location is the line before price that isn't a car spec (fuel/trans/year)
          const location = priceIdx > 0 && !/Diesel|Gasolina|Manual|Automático|\d{4}/.test(lines[priceIdx - 1])
            ? lines[priceIdx - 1] : null;

          return {
            source:      'custojusto',
            title:       titleEl ? titleEl.textContent.trim() : (lines.find(l => l.length > 5 && !/^\d+$|Montra|PRO|Hoje|Ontem|mai|abr|mar/.test(l)) || null),
            price,
            location,
            category:    null,
            image_url:   imgEl ? (imgEl.src || imgEl.dataset.src || null) : null,
            listing_url: el.href,
          };
        })
      ).catch(() => []);

      listings.push(...cards.filter((c) => c.title && c.listing_url));

      // Check for next page
      const hasNext = await page.$('a[rel="next"], [aria-label*="próxima"], [class*="next"]:not([class*="disabled"])');
      if (!hasNext) break;
    }
  } catch (err) {
    console.error('[custojusto] Scrape failed:', err.message);
  } finally {
    await browser.close().catch(() => null);
  }

  console.log(`[custojusto] Found ${listings.length} listings`);
  return listings;
}

module.exports = { scrapeCustoJusto };
