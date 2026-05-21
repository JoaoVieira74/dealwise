const express = require('express');
const path = require('path');
const { getListings, getLastScrapeStatus } = require('./db/database');

function createApp(db) {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/listings', (req, res) => {
    const { source, limit } = req.query;
    if (source && !['olx', 'facebook'].includes(source)) {
      return res.status(400).json({ error: 'source must be "olx" or "facebook"' });
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    res.json(getListings(db, { source, limit: parsedLimit }));
  });

  app.get('/api/status', (req, res) => {
    res.json(getLastScrapeStatus(db));
  });

  return app;
}

module.exports = { createApp };
