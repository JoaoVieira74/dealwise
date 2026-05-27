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

      // Extract listings directly from __NEXT_DATA__ JSON — no lazy-load timing issues
      const items = await page.evaluate(() => {
        const nd = window.__NEXT_DATA__?.props?.pageProps;
        if (!nd) return [];
        return (nd.listItems || nd.listings || nd.data || nd.items || []).map(item => ({
          listID:        item.listID,
          title:         item.title,
          price:         item.price,
          imageFullURL:  item.imageFullURL,
          url:           item.url,
          district:      item.locationNames?.district || null,
          county:        item.locationNames?.county || null,
        }));
      });

      const cards = items
        .filter(item => item.title && item.url)
        .map(item => ({
          source:      'custojusto',
          title:       item.title,
          price:       item.price != null ? `${item.price.toLocaleString('pt-PT')} €` : null,
          location:    item.district || item.county || null,
          category:    null,
          image_url:   item.imageFullURL || null,
          listing_url: item.url.startsWith('http') ? item.url : `https://www.custojusto.pt${item.url}`,
        }));

      listings.push(...cards);

      // If fewer than 40 items, we've hit the last page
      if (items.length < 40) break;
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
