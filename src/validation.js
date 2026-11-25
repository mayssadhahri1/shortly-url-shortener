// Règles de validation des liens et des alias
const crypto = require('node:crypto');

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/l/I
const RESERVED = new Set(['api', 'health', 'stats', 'static', 'admin', 'favicon.ico']);
const ALIAS_RE = /^[a-zA-Z0-9_-]{3,32}$/;

// Génère un identifiant court aléatoire (cryptographiquement sûr)
function randomSlug(length = 7) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

// Retourne l'URL normalisée, ou null si elle n'est pas valide
function normalizeUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let value = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`; // « exemple.com » -> https://exemple.com
  try {
    const url = new URL(value);
    // seules les adresses web sont acceptées (pas de javascript:, file:, data:…)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function checkAlias(alias) {
  if (!ALIAS_RE.test(alias)) return '3 à 32 caractères : lettres, chiffres, - ou _';
  if (RESERVED.has(alias.toLowerCase())) return 'Cet alias est réservé';
  return null;
}

module.exports = { randomSlug, normalizeUrl, checkAlias };
