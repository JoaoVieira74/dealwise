const cron = require('node-cron');
const { scrapeOlx }          = require('./scrapers/olx');
const { scrapeFacebook }     = require('./scrapers/facebook');
const { scrapeStandvirtual } = require('./scrapers/standvirtual');
const { upsertListings, logScrape } = require('./db/database');

async function runScrapeJob(db) {
  console.log('[scheduler] Starting scrape cycle...');

  const [olxResult, fbResult, svResult] = await Promise.allSettled([
    scrapeOlx(),
    scrapeFacebook(),
    scrapeStandvirtual(),
  ]);

  if (olxResult.status === 'fulfilled') {
    upsertListings(db, olxResult.value);
    logScrape(db, 'olx', 'ok', olxResult.value.length, null);
    console.log(`[scheduler] OLX: ${olxResult.value.length} listings saved`);
  } else {
    logScrape(db, 'olx', 'error', 0, olxResult.reason?.message ?? 'unknown');
    console.error('[scheduler] OLX failed:', olxResult.reason);
  }

  if (fbResult.status === 'fulfilled') {
    upsertListings(db, fbResult.value);
    logScrape(db, 'facebook', 'ok', fbResult.value.length, null);
    console.log(`[scheduler] Facebook: ${fbResult.value.length} listings saved`);
  } else {
    logScrape(db, 'facebook', 'error', 0, fbResult.reason?.message ?? 'unknown');
    console.error('[scheduler] Facebook failed:', fbResult.reason);
  }

  if (svResult.status === 'fulfilled') {
    upsertListings(db, svResult.value);
    logScrape(db, 'standvirtual', 'ok', svResult.value.length, null);
    console.log(`[scheduler] StandVirtual: ${svResult.value.length} listings saved`);
  } else {
    logScrape(db, 'standvirtual', 'error', 0, svResult.reason?.message ?? 'unknown');
    console.error('[scheduler] StandVirtual failed:', svResult.reason);
  }

  console.log('[scheduler] Scrape cycle complete.');
}

function startScheduler(db) {
  runScrapeJob(db);
  cron.schedule('*/30 * * * *', () => runScrapeJob(db));
}

module.exports = { startScheduler };
