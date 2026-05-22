const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { SOURCES, getListings, getLastScrapeStatus, featureListing, unfeatureListing } = require('./db/database');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const featureLimiterMw = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

function createApp(db) {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'"],
        imgSrc:     ["'self'", "data:"],
        connectSrc: ["'self'"],
        workerSrc:  ["'self'"],
      },
    },
  }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/listings', apiLimiter, (req, res) => {
    const { source, limit, q } = req.query;
    if (source && !SOURCES.includes(source)) {
      return res.status(400).json({ error: `source must be one of: ${SOURCES.join(', ')}` });
    }
    let parsedLimit = 500;
    if (limit !== undefined) {
      parsedLimit = parseInt(limit, 10);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
        return res.status(400).json({ error: 'limit must be a positive integer ≤ 1000' });
      }
    }
    res.json(getListings(db, { source: source || null, limit: parsedLimit, q: q || null }));
  });

  app.get('/api/status', apiLimiter, (req, res) => {
    res.json(getLastScrapeStatus(db));
  });

  app.post('/api/feature', featureLimiterMw, express.json({ limit: '4kb' }), (req, res) => {
    const { source, listing_url, days } = req.body || {};
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'invalid source' });
    if (!listing_url || typeof listing_url !== 'string' || listing_url.length > 1000) {
      return res.status(400).json({ error: 'invalid listing_url' });
    }
    const d = parseInt(days, 10);
    if (!Number.isInteger(d) || d < 1 || d > 30) {
      return res.status(400).json({ error: 'days must be between 1 and 30' });
    }
    featureListing(db, source, listing_url, d);
    res.json({ ok: true });
  });

  app.delete('/api/feature', featureLimiterMw, express.json({ limit: '4kb' }), (req, res) => {
    const { source, listing_url } = req.body || {};
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'invalid source' });
    if (!listing_url || typeof listing_url !== 'string') {
      return res.status(400).json({ error: 'invalid listing_url' });
    }
    unfeatureListing(db, source, listing_url);
    res.json({ ok: true });
  });

  // Image proxy — fetches images server-side with correct Referer header
  app.get('/api/image', imageLimiter, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).end();

    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).end(); }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return res.status(400).end();

    const allowed = ['olx.pt', 'olxcdn.com', 'fbcdn.net', 'scontent'];
    if (!allowed.some(h => parsed.hostname.includes(h))) return res.status(403).end();

    const referer = (parsed.hostname.includes('olx') || parsed.hostname.includes('olxcdn'))
      ? 'https://www.olx.pt/'
      : 'https://www.facebook.com/';

    // Upgrade OLX CDN thumbnails to higher resolution
    let fetchUrl = url;
    if (parsed.hostname.includes('olxcdn')) {
      fetchUrl = url.replace(/;s=\d+x\d+(;q=\d+)?/, ';s=640x427;q=82');
    }

    try {
      const upstream = await fetch(fetchUrl, {
        headers: {
          'Referer': referer,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      if (!upstream.ok) return res.status(upstream.status).end();
      const ct = upstream.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) return res.status(415).end();
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err) {
      console.error('[proxy] image fetch error:', err.message);
      res.status(502).end();
    }
  });

  return app;
}

module.exports = { createApp };
