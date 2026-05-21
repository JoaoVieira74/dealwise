const request = require('supertest');
const Database = require('better-sqlite3');
const { initDb, upsertListings, logScrape } = require('../src/db/database');
const { createApp } = require('../src/api');

function makeDb() {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

describe('GET /api/listings', () => {
  test('returns empty array when no listings', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/listings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    db.close();
  });

  test('returns all listings', async () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'Car',  price: '5000€', location: 'Porto',  category: 'Veículos', image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'Bike', price: '200€',  location: 'Lisboa', category: null,       image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    const res = await request(createApp(db)).get('/api/listings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    db.close();
  });

  test('filters by source=olx', async () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'Car',  price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'Bike', price: null, location: null, category: null, image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    const res = await request(createApp(db)).get('/api/listings?source=olx');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe('olx');
    db.close();
  });

  test('rejects invalid source param with 400', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/listings?source=twitter');
    expect(res.status).toBe(400);
    db.close();
  });

  test('respects limit param', async () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx', title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'olx', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/2' },
      { source: 'olx', title: 'C', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/3' },
    ]);
    const res = await request(createApp(db)).get('/api/listings?limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    db.close();
  });

  test('rejects non-integer limit with 400', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/listings?limit=abc');
    expect(res.status).toBe(400);
    db.close();
  });

  test('rejects negative limit with 400', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/listings?limit=-5');
    expect(res.status).toBe(400);
    db.close();
  });
});

describe('GET /api/status', () => {
  test('returns null for both sources when no scrapes have run', async () => {
    const db = makeDb();
    const res = await request(createApp(db)).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.olx).toBeNull();
    expect(res.body.facebook).toBeNull();
    db.close();
  });

  test('returns last scrape status after a scrape log entry', async () => {
    const db = makeDb();
    logScrape(db, 'olx', 'ok', 50, null);
    const res = await request(createApp(db)).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.olx.status).toBe('ok');
    expect(res.body.olx.count).toBe(50);
    db.close();
  });
});
