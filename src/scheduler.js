const cron = require('node-cron');
const { scrapeOlx }          = require('./scrapers/olx');
const { scrapeFacebook }     = require('./scrapers/facebook');
const { scrapeStandvirtual } = require('./scrapers/standvirtual');
const { scrapeCustoJusto }   = require('./scrapers/custojusto');
const { scrapeAutoSapo }     = require('./scrapers/autosapo');
const { scrapeCarroJa }      = require('./scrapers/carroja');
const { upsertListings, logScrape } = require('./db/database');

const SCRAPERS = [
  { name: 'olx',         fn: scrapeOlx },
  { name: 'facebook',    fn: scrapeFacebook },
  { name: 'standvirtual',fn: scrapeStandvirtual },
  { name: 'custojusto',  fn: scrapeCustoJusto },
  { name: 'autosapo',    fn: scrapeAutoSapo },
  { name: 'carroja',     fn: scrapeCarroJa },
];

async function runScrapeJob(db) {
  console.log('[scheduler] Starting scrape cycle...');

  const results = await Promise.allSettled(SCRAPERS.map(s => s.fn()));

  for (let i = 0; i < SCRAPERS.length; i++) {
    const { name } = SCRAPERS[i];
    const result   = results[i];
    if (result.status === 'fulfilled') {
      upsertListings(db, result.value);
      logScrape(db, name, 'ok', result.value.length, null);
      console.log(`[scheduler] ${name}: ${result.value.length} listings saved`);
    } else {
      logScrape(db, name, 'error', 0, result.reason?.message ?? 'unknown');
      console.error(`[scheduler] ${name} failed:`, result.reason);
    }
  }

  console.log('[scheduler] Scrape cycle complete.');
}

function startScheduler(db) {
  runScrapeJob(db);
  cron.schedule('*/30 * * * *', () => runScrapeJob(db));
}

module.exports = { startScheduler };
