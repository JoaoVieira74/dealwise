const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');

chromium.use(stealth());

const PROFILE_DIR = process.env.FACEBOOK_PROFILE_DIR || path.join(__dirname, '..', '..', 'facebook_profile');
const MARKETPLACE_URL = 'https://www.facebook.com/marketplace/portugal/';

function isBlocked(url) {
  return url.includes('/login') || url.includes('/checkpoint') ||
         url.includes('/two_step_verification') || url.includes('two_factor');
}

async function waitUntilUnblocked(page) {
  const headless = process.env.FB_HEADLESS !== 'false';
  const maxWait  = headless ? 5 : 150; // headless: 10s; headed: 5min
  for (let i = 0; i < maxWait; i++) {
    await page.waitForTimeout(2000);
    if (!isBlocked(page.url())) return true;
  }
  return false;
}

async function extractListings(page) {
  // Scroll to trigger lazy loading of item cards
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
      // Strip query params from URL to get clean item link
      const url = el.href.split('?')[0];
      return {
        source:      'facebook',
        title:       img ? img.alt : (spans[0] || null),
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
  const fs = require('fs');
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log('[facebook] No profile found — skipping (set FACEBOOK_PROFILE_DIR to enable)');
    return [];
  }

  const headless = process.env.FB_HEADLESS !== 'false';
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-minimized'],
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await ctx.newPage();
    await page.goto(MARKETPLACE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    if (isBlocked(page.url())) {
      console.log('[facebook] Auth required — opening browser for verification...');
      const unblocked = await waitUntilUnblocked(page);
      if (!unblocked) {
        console.warn('[facebook] Auth timeout. Skipping Facebook.');
        return [];
      }
      await page.goto(MARKETPLACE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }

    const listings = await extractListings(page);
    const valid    = listings.filter((l) => l.title && l.listing_url);
    console.log(`[facebook] Found ${valid.length} listings`);
    return valid;
  } catch (err) {
    console.error('[facebook] Scrape failed:', err.message);
    return [];
  } finally {
    await ctx.close();
  }
}

module.exports = { scrapeFacebook };
