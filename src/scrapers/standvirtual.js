const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

const SV_URL    = 'https://www.standvirtual.com/carros';
const MAX_PAGES = 3;

async function scrapeStandvirtual() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' });
  const listings = [];

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = pageNum === 1 ? SV_URL : `${SV_URL}?page=${pageNum}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(2000);

      // Dismiss cookie consent if present
      await page.click('button#onetrust-accept-btn-handler').catch(() => null);
      await page.waitForTimeout(500);

      const cards = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('article[data-media-size]')).map(el => {
          const linkEl  = el.querySelector('a[href*="standvirtual.com"]');
          const imgEl   = el.querySelector('img');

          // Title is in <h2>, price number in <h3>
          const titleEl = el.querySelector('h2');
          const priceH3 = el.querySelector('h3');
          const priceRaw = priceH3 ? priceH3.textContent.trim() : null;
          const price = priceRaw ? priceRaw.replace(/\s+/g, ' ') + ' €' : null;

          // Car specs from dt/dd pairs
          const specs = {};
          el.querySelectorAll('dt, dd').forEach((node, i, arr) => {
            if (node.tagName === 'DT') {
              const dd = arr[i + 1];
              if (dd && dd.tagName === 'DD') specs[node.textContent.trim()] = dd.textContent.trim();
            }
          });

          // Build location from year + mileage if available
          const year = specs['first_registration_year'] || '';
          const km   = specs['mileage'] || '';
          const location = [year, km].filter(Boolean).join(' · ') || null;

          return {
            source:      'standvirtual',
            title:       titleEl ? titleEl.textContent.trim() : null,
            price,
            location,
            category:    'carros',
            image_url:   imgEl ? (imgEl.src || imgEl.dataset.src || null) : null,
            listing_url: linkEl ? linkEl.href.split('?')[0] : null,
          };
        });
      });

      const valid = cards.filter(c => c.title && c.listing_url);
      listings.push(...valid);
      console.log(`[standvirtual] Page ${pageNum}: ${valid.length} listings`);

      const hasNext = await page.$('a[data-cy="pagination-forward"], [aria-label="Próxima página"], a[rel="next"]');
      if (!hasNext) break;
    }
  } catch (err) {
    console.error('[standvirtual] Scrape error:', err.message);
  } finally {
    await browser.close();
  }

  console.log(`[standvirtual] Total: ${listings.length} listings`);
  return listings;
}

module.exports = { scrapeStandvirtual };
