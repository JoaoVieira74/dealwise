const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
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

  // Image proxy — fetches images server-side with correct Referer header
  app.get('/api/image', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).end();

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).end();
    }

    // Only allow known image CDN hostnames
    const allowed = ['static.olx.pt', 'scontent', 'fbcdn.net', 'xx.fbcdn.net'];
    if (!allowed.some(h => parsed.hostname.includes(h))) {
      return res.status(403).end();
    }

    const referer = parsed.hostname.includes('olx') ? 'https://www.olx.pt/' : 'https://www.facebook.com/';
    const client  = parsed.protocol === 'https:' ? https : http;

    const proxyReq = client.get(url, {
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    }, (proxyRes) => {
      if (proxyRes.statusCode >= 400) return res.status(proxyRes.statusCode).end();
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      proxyRes.pipe(res);
    });

    proxyReq.on('error', () => res.status(502).end());
  });

  return app;
}

module.exports = { createApp };
