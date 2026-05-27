const https = require('https');

const BASE = 'https://auto.sapo.pt';
const PAGES = 5;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9',
        'Cache-Control': 'no-cache',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parsePage(html) {
  const cards = [];
  const articleRe = /<article\b[^>]*class="vehicle-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let match;
  while ((match = articleRe.exec(html)) !== null) {
    const block = match[1];

    // URL + title from itemprop="url" link
    const linkM = /itemprop="url"\s*>([^<]+)<span>([^<]*)<\/span>/.exec(block);
    if (!linkM) continue;
    const title = (linkM[1].trim() + ' ' + linkM[2].trim()).trim();

    const hrefM = /href="(\/carro-usado\/[^"]+)"/.exec(block);
    if (!hrefM) continue;
    const listing_url = BASE + hrefM[1];

    // Price — strip the <small>€</small> tag and surrounding whitespace
    const priceM = /<div class="price">\s*<span>([\d.,\s]+)<small>/.exec(block);
    const price = priceM ? priceM[1].trim().replace(/\s/g, '.') + ' €' : null;

    // Image — prefer .webp source, fall back to img src
    const srcsetM = /<source srcset="([^"]+)" type="image\/webp"/.exec(block);
    const imgM    = /<img [^>]*src="([^"]+)"/.exec(block);
    const raw_img = srcsetM ? srcsetM[1] : (imgM ? imgM[1] : null);
    const image_url = raw_img ? (raw_img.startsWith('http') ? raw_img : BASE + raw_img) : null;

    cards.push({ source: 'autosapo', title, price, location: null, category: 'Automóveis', image_url, listing_url });
  }
  return cards;
}

async function scrapeAutoSapo() {
  const all = [];
  for (let page = 1; page <= PAGES; page++) {
    try {
      const url = page === 1 ? `${BASE}/carros-usados` : `${BASE}/carros-usados?page=${page}`;
      const html = await fetch(url);
      const cards = parsePage(html);
      if (!cards.length) break;
      all.push(...cards);
    } catch (e) {
      console.warn(`[autosapo] page ${page} error:`, e.message);
      break;
    }
  }
  console.log(`[autosapo] ${all.length} listings`);
  return all;
}

module.exports = { scrapeAutoSapo };
