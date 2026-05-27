// AutoSapo uses a Svelte SPA with strict bot detection that blocks headless browsers.
// The consent flow prevents listings from loading without real user interaction.
async function scrapeAutoSapo() {
  console.log('[autosapo] Skipped — site blocks headless browsers');
  return [];
}

module.exports = { scrapeAutoSapo };
