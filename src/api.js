const express = require('express');
const path = require('path');
const { SOURCES, getListings, getLastScrapeStatus } = require('./db/database');

function createApp(db) {
  const app = express();

  // public/ is created in Task 7
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/listings', (req, res) => {
    const { source, limit } = req.query;
    if (source && !SOURCES.includes(source)) {
      return res.status(400).json({ error: `source must be one of: ${SOURCES.join(', ')}` });
    }
    let parsedLimit = 100;
    if (limit !== undefined) {
      parsedLimit = parseInt(limit, 10);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({ error: 'limit must be a positive integer' });
      }
    }
    res.json(getListings(db, { source: source || null, limit: parsedLimit }));
  });

  app.get('/api/status', (req, res) => {
    res.json(getLastScrapeStatus(db));
  });

  return app;
}

module.exports = { createApp };
