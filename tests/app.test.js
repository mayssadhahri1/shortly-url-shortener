const request = require('supertest');
const { createApp } = require('../src/app');
const { normalizeUrl, checkAlias, randomSlug } = require('../src/validation');

let app;
beforeEach(() => {
  app = createApp({ baseUrl: 'https://sho.rt' }); // base SQLite en mémoire, neuve à chaque test
});

describe('validation', () => {
  test('normalise les URL et ajoute https', () => {
    expect(normalizeUrl('exemple.com/page')).toBe('https://exemple.com/page');
    expect(normalizeUrl('http://site.tn')).toBe('http://site.tn/');
  });

  test('refuse les schémas dangereux et les valeurs invalides', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('pas une url')).toBeNull();
    expect(normalizeUrl(42)).toBeNull();
  });

  test('alias', () => {
    expect(checkAlias('mon-cv')).toBeNull();
    expect(checkAlias('a')).not.toBeNull();
    expect(checkAlias('api')).toBe('Cet alias est réservé');
  });

  test('identifiants aléatoires', () => {
    const slugs = new Set(Array.from({ length: 500 }, () => randomSlug()));
    expect(slugs.size).toBe(500);
    for (const s of slugs) expect(s).toMatch(/^[a-zA-Z2-9]{7}$/);
  });
});

describe('API', () => {
  test('crée un lien court', async () => {
    const res = await request(app).post('/api/links').send({ url: 'https://github.com/mayssadhahri1' });
    expect(res.status).toBe(201);
    expect(res.body.shortUrl).toMatch(/^https:\/\/sho\.rt\/[a-zA-Z2-9]{7}$/);
    expect(res.body.clicks).toBe(0);
  });

  test('alias personnalisé et doublon', async () => {
    await request(app).post('/api/links').send({ url: 'site.tn', alias: 'portfolio' }).expect(201);
    const dup = await request(app).post('/api/links').send({ url: 'autre.tn', alias: 'portfolio' });
    expect(dup.status).toBe(409);
  });

  test('erreurs de saisie', async () => {
    await request(app).post('/api/links').send({ url: 'javascript:alert(1)' }).expect(400);
    await request(app).post('/api/links').send({ url: 'site.tn', expiresInDays: 0 }).expect(400);
    await request(app).post('/api/links').set('Content-Type', 'application/json').send('{mauvais').expect(400);
  });

  test('redirige et compte les clics', async () => {
    await request(app).post('/api/links').send({ url: 'https://exemple.com', alias: 'demo' });
    const r = await request(app).get('/demo').set('Referer', 'https://www.linkedin.com/feed');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('https://exemple.com/');
    await request(app).get('/demo');

    const stats = await request(app).get('/api/links/demo');
    expect(stats.body.clicks).toBe(2);
    expect(stats.body.last7Days).toEqual([{ day: expect.any(String), clicks: 2 }]);
    expect(stats.body.referrers).toEqual(
      expect.arrayContaining([{ source: 'www.linkedin.com', clicks: 1 }, { source: 'direct', clicks: 1 }]),
    );
  });

  test('lien inconnu', async () => {
    await request(app).get('/inconnu').expect(404);
    await request(app).get('/api/links/inconnu').expect(404);
  });

  test('liste les derniers liens', async () => {
    await request(app).post('/api/links').send({ url: 'a.tn', alias: 'premier' });
    await request(app).post('/api/links').send({ url: 'b.tn', alias: 'second' });
    const res = await request(app).get('/api/links');
    expect(res.body.map((l) => l.slug)).toEqual(['second', 'premier']);
  });

  test('QR code en PNG', async () => {
    await request(app).post('/api/links').send({ url: 'a.tn', alias: 'qrdemo' });
    const res = await request(app).get('/api/links/qrdemo/qr');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.subarray(1, 4).toString()).toBe('PNG');
  });

  test('suppression', async () => {
    await request(app).post('/api/links').send({ url: 'a.tn', alias: 'temp' });
    await request(app).delete('/api/links/temp').expect(204);
    await request(app).delete('/api/links/temp').expect(404);
    await request(app).get('/temp').expect(404);
  });

  test('lien expiré', async () => {
    await request(app).post('/api/links').send({ url: 'a.tn', alias: 'bientot', expiresInDays: 1 }).expect(201);
    const later = Date.now() + 2 * 86400000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    const RealDate = Date;
    global.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [later]));
      }
    };
    try {
      await request(app).get('/bientot').expect(410);
    } finally {
      global.Date = RealDate;
      jest.restoreAllMocks();
    }
  });

  test('page d\'accueil et santé', async () => {
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('Shortly');
    await request(app).get('/health').expect(200, { status: 'ok' });
  });
});
