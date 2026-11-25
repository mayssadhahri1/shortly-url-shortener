// Point d'entrée : lit la configuration et démarre le serveur
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'shortly.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const app = createApp({ dbFile: DB_FILE, baseUrl: BASE_URL });

app.listen(PORT, () => console.log(`Shortly démarré sur ${BASE_URL}`));
