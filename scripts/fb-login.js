/**
 * Run this script locally to log into Facebook and export cookies for Railway.
 *
 * Usage:
 *   node scripts/fb-login.js
 *
 * 1. A browser window will open.
 * 2. Log into your Facebook account manually.
 * 3. Navigate to facebook.com/marketplace (to confirm access).
 * 4. Press ENTER in the terminal.
 * 5. The script prints a FACEBOOK_COOKIES value — copy it to Railway Variables.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');

chromium.use(stealth());

async function main() {
  console.log('Opening browser... Log into Facebook, then press ENTER here.');

  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/marketplace/portugal/vehicles/cars/');

  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nPressione ENTER depois de fazer login no Facebook...\n', () => {
      rl.close();
      resolve();
    });
  });

  const cookies = await ctx.cookies('https://www.facebook.com');
  const encoded = Buffer.from(JSON.stringify(cookies)).toString('base64');

  console.log('\n✅ Cookies exportados. Adiciona esta variável ao Railway:\n');
  console.log('FACEBOOK_COOKIES=' + encoded);
  console.log('\nNota: Os cookies expiram em algumas semanas. Repete este processo quando o Facebook parar de aparecer no site.\n');

  await ctx.close();
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
