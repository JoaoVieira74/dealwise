const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const {
  SOURCES, getListings, getLastScrapeStatus,
  featureListing, unfeatureListing,
  createPayment, completePayment,
  createDealer, getDealerByToken, getDealerBySessionId,
  setDealerSession, activateDealer,
  getDealerCars, addDealerCar, removeDealerCar,
  getAllDealers, setDealerStatus,
  getAllFeatured, getAllPayments, getAdminStats,
} = require('./db/database');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const featureLimiterMw = rateLimit({
  windowMs: 15 * 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 600,
  standardHeaders: true, legacyHeaders: false,
});

// Featured listing prices (cents)
const PRICES = { 1: 99, 3: 199, 7: 399, 14: 699, 30: 1299 };

// Dealer subscription plans
const DEALER_PLANS = {
  basic:    { label: 'Básico',   amount: 2999, carLimit: 5 },
  standard: { label: 'Standard', amount: 5999, carLimit: 15 },
  premium:  { label: 'Premium',  amount: 9999, carLimit: 9999 },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

function createApp(db) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'"],
        imgSrc:     ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        workerSrc:  ["'self'"],
      },
    },
  }));

  // ── Stripe webhook (raw body — must be before static) ────────────────────
  app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const stripe = getStripe();
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).end();

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[stripe webhook] signature error:', err.message);
      return res.status(400).end();
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { source, listing_url, days, dealer_token } = session.metadata || {};

      // Featured listing payment
      if (source && listing_url && days && session.payment_status === 'paid') {
        const d = parseInt(days, 10);
        if (SOURCES.includes(source) && PRICES[d]) {
          featureListing(db, source, listing_url, d);
          completePayment(db, session.id);
        }
      }

      // Dealer subscription
      if (dealer_token) {
        const dealer = getDealerByToken(db, dealer_token);
        if (dealer && dealer.status !== 'active') {
          activateDealer(db, dealer_token, session.subscription, session.customer);
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ── Listings ──────────────────────────────────────────────────────────────
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

  // ── Featured listing checkout ─────────────────────────────────────────────
  app.post('/api/checkout', featureLimiterMw, express.json({ limit: '4kb' }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

    const { source, listing_url, days, email } = req.body || {};
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'invalid source' });
    if (!listing_url || typeof listing_url !== 'string' || listing_url.length > 1000)
      return res.status(400).json({ error: 'invalid listing_url' });
    const d = parseInt(days, 10);
    if (!PRICES[d]) return res.status(400).json({ error: 'invalid days' });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid email' });

    try {
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
        cancel_url:  `${baseUrl}/cancel.html`,
        metadata: { source, listing_url, days: String(d) },
      });
      createPayment(db, session.id, source, listing_url, email, d, PRICES[d]);
      res.json({ url: session.url });
    } catch (err) {
      console.error('[stripe] checkout error:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // ── Featured listing verify ───────────────────────────────────────────────
  app.get('/api/verify', apiLimiter, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

    const { session_id } = req.query;
    if (!session_id || typeof session_id !== 'string' || session_id.length > 200)
      return res.status(400).json({ error: 'invalid session_id' });

    try {
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

  // ── Unfeature ─────────────────────────────────────────────────────────────
  app.delete('/api/feature', featureLimiterMw, express.json({ limit: '4kb' }), (req, res) => {
    const { source, listing_url } = req.body || {};
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'invalid source' });
    if (!listing_url || typeof listing_url !== 'string')
      return res.status(400).json({ error: 'invalid listing_url' });
    unfeatureListing(db, source, listing_url);
    res.json({ ok: true });
  });

  // ── Dealer: apply / subscribe ─────────────────────────────────────────────
  app.post('/api/dealers/apply', featureLimiterMw, express.json({ limit: '8kb' }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

    const { company, contact_name, email, phone, plan } = req.body || {};
    if (!company || typeof company !== 'string' || company.trim().length < 2)
      return res.status(400).json({ error: 'invalid company' });
    if (!contact_name || typeof contact_name !== 'string' || contact_name.trim().length < 2)
      return res.status(400).json({ error: 'invalid contact_name' });
    if (!email || !EMAIL_RE.test(email))
      return res.status(400).json({ error: 'invalid email' });
    if (!DEALER_PLANS[plan])
      return res.status(400).json({ error: 'invalid plan' });

    const planInfo = DEALER_PLANS[plan];
    const token = createDealer(db, {
      company: company.trim(),
      contactName: contact_name.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      plan,
      carLimit: planInfo.carLimit,
    });

    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email.trim(),
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: `Plano ${planInfo.label} — Dealwise Concessionárias` },
            unit_amount: planInfo.amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${baseUrl}/dealer-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/advertise.html`,
        metadata: { dealer_token: token },
      });
      setDealerSession(db, token, session.id);
      res.json({ url: session.url });
    } catch (err) {
      console.error('[stripe] dealer checkout error:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // ── Dealer: verify subscription ───────────────────────────────────────────
  app.get('/api/dealers/verify', apiLimiter, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

    const { session_id } = req.query;
    if (!session_id || typeof session_id !== 'string' || session_id.length > 200)
      return res.status(400).json({ error: 'invalid session_id' });

    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      const isPaid = session.payment_status === 'paid' || !!session.subscription;
      if (!isPaid) return res.json({ ok: false });

      const dealer = getDealerBySessionId(db, session_id);
      if (!dealer) return res.status(404).json({ error: 'dealer not found' });

      if (dealer.status !== 'active') {
        activateDealer(db, dealer.token, session.subscription, session.customer);
      }
      res.json({ ok: true, token: dealer.token, company: dealer.company });
    } catch (err) {
      console.error('[stripe] dealer verify error:', err.message);
      res.status(500).json({ error: 'verification failed' });
    }
  });

  // ── Dealer: portal info ───────────────────────────────────────────────────
  app.get('/api/dealers/portal', apiLimiter, (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'invalid token' });

    const dealer = getDealerByToken(db, token);
    if (!dealer || dealer.status !== 'active') return res.status(403).json({ error: 'unauthorized' });

    const cars = getDealerCars(db, dealer.id);
    res.json({
      dealer: {
        company: dealer.company,
        contact_name: dealer.contact_name,
        email: dealer.email,
        plan: dealer.plan,
        car_limit: dealer.car_limit,
      },
      cars,
    });
  });

  // ── Dealer: add car ───────────────────────────────────────────────────────
  app.post('/api/dealers/cars', featureLimiterMw, express.json({ limit: '8kb' }), (req, res) => {
    const { token, title, price, location, image_url, contact_url } = req.body || {};

    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'invalid token' });
    const dealer = getDealerByToken(db, token);
    if (!dealer || dealer.status !== 'active') return res.status(403).json({ error: 'unauthorized' });

    if (!title || typeof title !== 'string' || title.trim().length < 2 || title.length > 300)
      return res.status(400).json({ error: 'invalid title' });

    const cars = getDealerCars(db, dealer.id);
    if (dealer.car_limit !== 9999 && cars.length >= dealer.car_limit)
      return res.status(400).json({ error: `car limit reached (${dealer.car_limit})` });

    if (contact_url) {
      try {
        const u = new URL(contact_url);
        if (!['http:', 'https:', 'tel:', 'mailto:'].includes(u.protocol))
          return res.status(400).json({ error: 'invalid contact_url protocol' });
      } catch {
        return res.status(400).json({ error: 'invalid contact_url' });
      }
    }

    const listingUrl = addDealerCar(db, dealer.id, {
      title: title.trim(),
      price: price?.trim() || null,
      location: location?.trim() || null,
      imageUrl: image_url?.trim() || null,
      contactUrl: contact_url?.trim() || null,
    });
    res.json({ ok: true, listing_url: listingUrl });
  });

  // ── Dealer: remove car ────────────────────────────────────────────────────
  app.delete('/api/dealers/cars/:id', featureLimiterMw, express.json({ limit: '4kb' }), (req, res) => {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'invalid token' });

    const dealer = getDealerByToken(db, token);
    if (!dealer || dealer.status !== 'active') return res.status(403).json({ error: 'unauthorized' });

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid id' });

    const ok = removeDealerCar(db, id, dealer.id);
    res.json({ ok });
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  function requireAdmin(req, res, next) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) return res.status(503).json({ error: 'Admin not configured — set ADMIN_TOKEN env var' });
    const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (auth !== adminToken) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    res.json(getAdminStats(db));
  });

  app.get('/api/admin/dealers', requireAdmin, (req, res) => {
    res.json(getAllDealers(db));
  });

  app.post('/api/admin/dealers', requireAdmin, express.json({ limit: '8kb' }), (req, res) => {
    const { company, contact_name, email, phone, plan, activate } = req.body || {};
    if (!company || !contact_name || !email || !DEALER_PLANS[plan])
      return res.status(400).json({ error: 'missing required fields: company, contact_name, email, plan' });
    const planInfo = DEALER_PLANS[plan];
    const token = createDealer(db, {
      company: company.trim(),
      contactName: contact_name.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      plan,
      carLimit: planInfo.carLimit,
    });
    if (activate) {
      setDealerStatus(db, token, 'active');
    }
    res.json({ ok: true, token });
  });

  app.patch('/api/admin/dealers/:token', requireAdmin, express.json({ limit: '4kb' }), (req, res) => {
    const { token } = req.params;
    const { status } = req.body || {};
    if (!['active', 'pending', 'inactive'].includes(status))
      return res.status(400).json({ error: 'status must be active | pending | inactive' });
    setDealerStatus(db, token, status);
    res.json({ ok: true });
  });

  app.get('/api/admin/featured', requireAdmin, (req, res) => {
    res.json(getAllFeatured(db));
  });

  app.delete('/api/admin/featured', requireAdmin, express.json({ limit: '4kb' }), (req, res) => {
    const { source, listing_url } = req.body || {};
    if (!SOURCES.includes(source) || !listing_url) return res.status(400).json({ error: 'invalid body' });
    unfeatureListing(db, source, listing_url);
    res.json({ ok: true });
  });

  app.get('/api/admin/payments', requireAdmin, (req, res) => {
    res.json(getAllPayments(db));
  });

  // ── Image proxy ───────────────────────────────────────────────────────────
  app.get('/api/image', imageLimiter, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).end();

    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).end(); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return res.status(400).end();

    const allowed = ['olx.pt', 'olxcdn.com', 'fbcdn.net', 'scontent', 'standvirtual.com', 'autovit.ro', 'custojusto.pt'];
    if (!allowed.some(h => parsed.hostname.includes(h))) return res.status(403).end();

    const referer = (parsed.hostname.includes('olx') || parsed.hostname.includes('olxcdn'))
      ? 'https://www.olx.pt/'
      : parsed.hostname.includes('standvirtual')
        ? 'https://www.standvirtual.com/'
        : parsed.hostname.includes('custojusto')
          ? 'https://www.custojusto.pt/'
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
