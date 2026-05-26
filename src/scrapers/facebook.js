const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

chromium.use(stealth());

const PROFILE_DIR = process.env.FACEBOOK_PROFILE_DIR || path.join(__dirname, '..', '..', 'facebook_profile');
const MARKETPLACE_URL = 'https://www.facebook.com/marketplace/portugal/vehicles/cars/';

function isBlocked(url) {
  return url.includes('/login') || url.includes('/checkpoint') ||
         url.includes('/two_step_verification') || url.includes('two_factor');
}

async function extractListings(page) {
  for (let i = 1; i <= 5; i++) {
    await page.evaluate((n) => window.scrollTo(0, n * 600), i);
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  return page.$$eval('a[href*="/marketplace/item/"]', (els) =>
    els.map((el) => {
      const img   = el.querySelector('img');
      const spans = Array.from(el.querySelectorAll('span'))
        .map((s) => s.textContent.trim())
        .filter(Boolean);
      const price = spans.find((t) => /\d/.test(t) && (t.includes('€') || t.toLowerCase().includes('grát'))) || null;
      const url = el.href.split('?')[0];
      const rawTitle = img ? img.alt : (spans[0] || null);
      const title = rawTitle ? rawTitle.replace(/\s+no grupo\b.*/i, '').trim() : null;
      return {
        source:      'facebook',
        title:       title || null,
        price,
        location:    spans[spans.length - 1] || null,
        category:    null,
        image_url:   img ? img.src : null,
        listing_url: url,
      };
    })
  ).catch(() => []);
}

async function scrapeFacebook() {
  const cookiesEnv = process.env.FACEBOOK_COOKIES;
  const hasProfile = fs.existsSync(PROFILE_DIR);

  if (!cookiesEnv && !hasProfile) {
    console.log('[facebook] No auth configured — skipping. Run scripts/fb-login.js locally to set up.');
    return [];
  }

  let ctx;
  try {
    if (cookiesEnv) {
      // Use cookies from env var (base64-encoded JSON array)
      const cookies = JSON.parse(Buffer.from(cookiesEnv, 'base64').toString('utf8'));
      ctx = await chromium.launchPersistentContext('', {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        viewport: { width: 1280, height: 800 },
      });
      await ctx.addCookies(cookies);
    } else {
      // Fall back to saved profile dir
      ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        viewport: { width: 1280, height: 800 },
      });
    }

    const page = await ctx.newPage();
    await page.goto(MARKETPLACE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    if (isBlocked(page.url())) {
      console.warn('[facebook] Auth required — cookies may have expired. Re-run scripts/fb-login.js.');
      return [];
    }

    const listings = await extractListings(page);
    const valid = listings.filter((l) => l.title && l.listing_url);
    console.log(`[facebook] Found ${valid.length} listings`);
    return valid;
  } catch (err) {
    console.error('[facebook] Scrape failed:', err.message);
    return [];
  } finally {
    if (ctx) await ctx.close();
  }
}

module.exports = { scrapeFacebook };
