const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

chromium.use(stealth());

const PROFILE_DIR    = process.env.FACEBOOK_PROFILE_DIR || path.join(__dirname, '..', '..', 'facebook_profile');
const MARKETPLACE_URL = 'https://www.facebook.com/marketplace/portugal/vehicles/cars/';

function isBlocked(url) {
  return url.includes('/login') || url.includes('/checkpoint') ||
         url.includes('/two_step_verification') || url.includes('two_factor');
}

async function extractListings(page) {
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((n) => window.scrollTo(0, n * 700), i);
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  return page.$$eval('a[href*="/marketplace/item/"]', (els) =>
    els.map((el) => {
      const img   = el.querySelector('img');
      const spans = Array.from(el.querySelectorAll('span'))
        .map((s) => s.textContent.trim())
        .filter(Boolean);
      const price = spans.find((t) => /\d/.test(t) && (t.includes('€') || t.toLowerCase().includes('grát'))) || null;
      const url   = el.href.split('?')[0];
      const rawTitle = img ? img.alt : (spans[0] || null);
      const title    = rawTitle ? rawTitle.replace(/\s+no grupo\b.*/i, '').trim() : null;
      return { source: 'facebook', title, price, location: spans[spans.length - 1] || null, category: null, image_url: img ? img.src : null, listing_url: url };
    })
  ).catch(() => []);
}

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
const NEW_CONTEXT_OPTS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'pt-PT',
  timezoneId: 'Europe/Lisbon',
  viewport: { width: 1280, height: 800 },
};

async function tryWithContext(ctx) {
  const page = await ctx.newPage();
  try {
    await page.goto(MARKETPLACE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    if (isBlocked(page.url())) return null; // signal: blocked
    const listings = await extractListings(page);
    return listings.filter((l) => l.title && l.listing_url);
  } finally {
    await page.close();
  }
}

async function scrapeFacebook() {
  // 1. Try anonymous scraping (stealth + pt-PT locale)
  try {
    const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const ctx = await browser.newContext(NEW_CONTEXT_OPTS);
    try {
      const listings = await tryWithContext(ctx);
      if (listings !== null) {
        console.log(`[facebook] Anonymous: ${listings.length} listings`);
        if (listings.length > 0) return listings;
        // Got 0 but no login wall — still blocked, try auth
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn('[facebook] Anonymous attempt failed:', err.message);
  }

  // 2. Try with FACEBOOK_COOKIES env var
  const cookiesEnv = process.env.FACEBOOK_COOKIES;
  if (cookiesEnv) {
    try {
      const cookies = JSON.parse(Buffer.from(cookiesEnv, 'base64').toString('utf8'));
      const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
      const ctx = await browser.newContext(NEW_CONTEXT_OPTS);
      await ctx.addCookies(cookies);
      try {
        const listings = await tryWithContext(ctx);
        if (listings !== null) {
          console.log(`[facebook] Cookie auth: ${listings.length} listings`);
          return listings;
        }
        console.warn('[facebook] Cookie auth: cookies may have expired');
      } finally {
        await browser.close();
      }
    } catch (err) {
      console.warn('[facebook] Cookie auth failed:', err.message);
    }
  }

  // 3. Try with saved profile dir
  if (fs.existsSync(PROFILE_DIR)) {
    try {
      const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true, args: LAUNCH_ARGS, ...NEW_CONTEXT_OPTS,
      });
      try {
        const listings = await tryWithContext(ctx);
        if (listings !== null) {
          console.log(`[facebook] Profile: ${listings.length} listings`);
          return listings;
        }
        console.warn('[facebook] Profile: auth expired');
      } finally {
        await ctx.close();
      }
    } catch (err) {
      console.warn('[facebook] Profile attempt failed:', err.message);
    }
  }

  console.log('[facebook] All methods blocked — 0 listings');
  return [];
}

module.exports = { scrapeFacebook };
