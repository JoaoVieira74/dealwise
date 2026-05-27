/**
 * Run this script locally to log into Facebook and export cookies for Railway.
 *
 * Usage:
 *   node scripts/fb-login.js
 *
 * 1. A browser window will open at Facebook.
 * 2. Log into your Facebook account manually.
 * 3. The script detects login automatically and saves cookies to fb-cookies.txt.
 * 4. Copy the value from fb-cookies.txt to Railway as FACEBOOK_COOKIES variable.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

chromium.use(stealth());

const OUT_FILE = path.join(__dirname, 'fb-cookies.txt');

async function main() {
  console.log('A abrir browser... Faz login no Facebook.');
  console.log('O script deteta o login automaticamente (tens 5 minutos).\n');

  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/login');

  // Wait until no longer on login/checkpoint page (up to 5 minutes)
  try {
    await page.waitForFunction(
      () => !location.href.includes('/login') && !location.href.includes('/checkpoint') && !location.href.includes('two_factor'),
      { timeout: 300000, polling: 2000 }
    );
  } catch {
    console.error('Timeout: não foi detetado login em 5 minutos.');
    await ctx.close();
    process.exit(1);
  }

  // Navigate to marketplace to ensure cookies are full
  await page.goto('https://www.facebook.com/marketplace/portugal/vehicles/cars/');
  await page.waitForTimeout(3000);

  const cookies = await ctx.cookies('https://www.facebook.com');
  const encoded = Buffer.from(JSON.stringify(cookies)).toString('base64');

  fs.writeFileSync(OUT_FILE, encoded, 'utf8');
  console.log(`\n✅ Cookies guardados em: ${OUT_FILE}`);
  console.log('Copia o conteúdo desse ficheiro para Railway como variável FACEBOOK_COOKIES.\n');

  await ctx.close();
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
