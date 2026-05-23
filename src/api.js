const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { SOURCES, getListings, getLastScrapeStatus, featureListing, unfeatureListing, createPayment, completePayment } = require('./db/database');

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

const PRICES = { 1: 99, 3: 199, 7: 399, 14: 699, 30: 1299 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // ── Stripe webhook (raw body required — must be before static/json middleware) ──
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
      const sig = req.headers['stripe-signature'];
      if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).end();

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('[stripe webhook] signature error:', err.message);
        return res.status(400).end();
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.payment_status === 'paid') {
          const { source, listing_url, days } = session.metadata || {};
          const d = parseInt(days, 10);
          if (SOURCES.includes(source) && listing_url && PRICES[d]) {
            featureListing(db, source, listing_url, d);
            completePayment(db, session.id);
          }
        }
      }

      res.json({ received: true });
    });
  }

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

  // ── Stripe checkout ────────────────────────────────────────────────────────
  app.post('/api/checkout', featureLimiterMw, express.json({ limit: '4kb' }), async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Payments not configured' });
    }

    const { source, listing_url, days, email } = req.body || {};

    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'invalid source' });
    if (!listing_url || typeof listing_url !== 'string' || listing_url.length > 1000)
      return res.status(400).json({ error: 'invalid listing_url' });
    const d = parseInt(days, 10);
    if (!PRICES[d]) return res.status(400).json({ error: 'invalid days' });
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email))
      return res.status(400).json({ error: 'invalid email' });

    try {
      const Stripe = require('stripe');
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: `Destaque por ${d} ${d === 1 ? 'dia' : 'dias'} — Dealwise` },
            unit_amount: PRICES[d],
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/cancel.html`,
        metadata: { source, listing_url, days: String(d) },
      });

      createPayment(db, session.id, source, listing_url, email, d, PRICES[d]);

      res.json({ url: session.url });
    } catch (err) {
      console.error('[stripe] checkout error:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // ── Verify payment + activate featured ────────────────────────────────────
  app.get('/api/verify', apiLimiter, async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });

    const { session_id } = req.query;
    if (!session_id || typeof session_id !== 'string' || session_id.length > 200)
      return res.status(400).json({ error: 'invalid session_id' });

    try {
      const Stripe = require('stripe');
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== 'paid') return res.json({ paid: false });

      const { source, listing_url, days } = session.metadata || {};
      const d = parseInt(days, 10);

      if (SOURCES.includes(source) && listing_url && PRICES[d]) {
        featureListing(db, source, listing_url, d);
        completePayment(db, session_id);
      }

      res.json({ paid: true, days: d });
    } catch (err) {
      console.error('[stripe] verify error:', err.message);
      res.status(500).json({ error: 'verification failed' });
    }
  });

  // ── Unfeature (free) ───────────────────────────────────────────────────────
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
