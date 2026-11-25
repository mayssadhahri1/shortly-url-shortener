// Application Express : API REST + redirection + interface web
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const QRCode = require('qrcode');
const { openDb } = require('./db');
const { randomSlug, normalizeUrl, checkAlias } = require('./validation');

function createApp({ dbFile = ':memory:', baseUrl = 'http://localhost:3000' } = {}) {
  const { q, recordClick } = openDb(dbFile);
  const app = express();

  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:'] } } }));
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Format renvoyé au client
  const present = (link) => ({
    slug: link.slug,
    url: link.url,
    shortUrl: `${baseUrl}/${link.slug}`,
    clicks: link.clicks,
    createdAt: link.created_at,
    lastClick: link.last_click,
    expiresAt: link.expires_at,
  });

  const isExpired = (link) => link.expires_at && new Date(`${link.expires_at}Z`) < new Date();

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Créer un lien court
  app.post('/api/links', (req, res) => {
    const url = normalizeUrl(req.body?.url);
    if (!url) return res.status(400).json({ error: 'URL invalide (http ou https uniquement)' });

    const { alias, expiresInDays } = req.body;
    let expiresAt = null;
    if (expiresInDays !== undefined && expiresInDays !== null && expiresInDays !== '') {
      const days = Number(expiresInDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return res.status(400).json({ error: "La durée de validité doit être entre 1 et 365 jours" });
      }
      expiresAt = new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    }

    let slug;
    if (alias) {
      const problem = checkAlias(alias);
      if (problem) return res.status(400).json({ error: problem });
      if (q.get.get(alias)) return res.status(409).json({ error: 'Cet alias est déjà utilisé' });
      slug = alias;
    } else {
      do slug = randomSlug(); while (q.get.get(slug)); // collision très improbable, mais on vérifie
    }

    q.insert.run(slug, url, expiresAt);
    return res.status(201).json(present(q.get.get(slug)));
  });

  // Derniers liens créés
  app.get('/api/links', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(q.recent.all(limit).map(present));
  });

  // Statistiques détaillées d'un lien
  app.get('/api/links/:slug', (req, res) => {
    const link = q.get.get(req.params.slug);
    if (!link) return res.status(404).json({ error: 'Lien introuvable' });
    return res.json({
      ...present(link),
      expired: Boolean(isExpired(link)),
      last7Days: q.perDay.all(link.slug),
      referrers: q.referrers.all(link.slug),
    });
  });

  // QR code du lien court (image PNG)
  app.get('/api/links/:slug/qr', async (req, res, next) => {
    const link = q.get.get(req.params.slug);
    if (!link) return res.status(404).json({ error: 'Lien introuvable' });
    try {
      const png = await QRCode.toBuffer(`${baseUrl}/${link.slug}`, { width: 300, margin: 1 });
      return res.type('png').send(png);
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/api/links/:slug', (req, res) => {
    const { changes } = q.remove.run(req.params.slug);
    if (!changes) return res.status(404).json({ error: 'Lien introuvable' });
    return res.status(204).end();
  });

  // Redirection : c'est la route utilisée par les visiteurs
  app.get('/:slug', (req, res) => {
    const link = q.get.get(req.params.slug);
    if (!link) return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
    if (isExpired(link)) return res.status(410).send('Ce lien a expiré.');
    let referrer = null;
    try {
      referrer = req.get('referer') ? new URL(req.get('referer')).hostname : null;
    } catch {
      referrer = null;
    }
    recordClick(link.slug, referrer);
    return res.redirect(302, link.url);
  });

  // Gestionnaire d'erreurs global
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne' });
  });

  return app;
}

module.exports = { createApp };
