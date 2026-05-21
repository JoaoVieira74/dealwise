const Database = require('better-sqlite3');
const { initDb, upsertListings, getListings, logScrape, getLastScrapeStatus } = require('../src/db/database');

function makeDb() {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

describe('upsertListings', () => {
  test('inserts new listing', () => {
    const db = makeDb();
    upsertListings(db, [{
      source: 'olx', title: 'iPhone 14', price: '800€',
      location: 'Lisboa', category: 'Electrónica',
      image_url: 'https://example.com/img.jpg',
      listing_url: 'https://olx.pt/ad/1'
    }]);
    const rows = db.prepare('SELECT * FROM listings').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('iPhone 14');
    db.close();
  });

  test('ignores duplicate listing_url per source', () => {
    const db = makeDb();
    const listing = {
      source: 'olx', title: 'A', price: null, location: null,
      category: null, image_url: null, listing_url: 'https://olx.pt/ad/1'
    };
    upsertListings(db, [listing]);
    upsertListings(db, [listing]);
    const count = db.prepare('SELECT COUNT(*) as c FROM listings').get().c;
    expect(count).toBe(1);
    db.close();
  });
});

describe('getListings', () => {
  test('returns all listings when no filter', () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    expect(getListings(db, {})).toHaveLength(2);
    db.close();
  });

  test('filters by source', () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx',      title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'facebook', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://fb.com/1' },
    ]);
    const rows = getListings(db, { source: 'olx' });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('olx');
    db.close();
  });

  test('respects limit', () => {
    const db = makeDb();
    upsertListings(db, [
      { source: 'olx', title: 'A', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/1' },
      { source: 'olx', title: 'B', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/2' },
      { source: 'olx', title: 'C', price: null, location: null, category: null, image_url: null, listing_url: 'https://olx.pt/3' },
    ]);
    expect(getListings(db, { limit: 2 })).toHaveLength(2);
    db.close();
  });
});

describe('logScrape / getLastScrapeStatus', () => {
  test('records a scrape log and retrieves it', () => {
    const db = makeDb();
    logScrape(db, 'olx', 'ok', 42, null);
    const status = getLastScrapeStatus(db);
    expect(status.olx.status).toBe('ok');
    expect(status.olx.count).toBe(42);
    db.close();
  });

  test('returns null for source with no logs', () => {
    const db = makeDb();
    const status = getLastScrapeStatus(db);
    expect(status.olx).toBeNull();
    expect(status.facebook).toBeNull();
    db.close();
  });
});
