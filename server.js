const Database        = require('better-sqlite3');
const path            = require('path');
const { initDb }      = require('./src/db/database');
const { createApp }   = require('./src/api');
const { startScheduler } = require('./src/scheduler');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'market.db');
const PORT    = process.env.PORT || 3000;

const db  = new Database(DB_PATH);
initDb(db);

const app = createApp(db);
startScheduler(db);

app.listen(PORT, () => {
  console.log(`MarketAggregator running at http://localhost:${PORT}`);
});
