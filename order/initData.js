const fs = require('fs');
const path = require('path');

// NEW: use DB_FILE from environment (same variable used in server.js)
const DB_FILE = process.env.DB_FILE;

// NEW: seed file lives next to this script
const SEED_FILE = path.join(__dirname, 'orders.seed.json');

if (!DB_FILE) {
  console.error('DB_FILE is not set');
  process.exit(1);
}

// NEW: initialize DB only if it does not exist (first run / fresh volume)
if (!fs.existsSync(DB_FILE)) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.copyFileSync(SEED_FILE, DB_FILE);
  console.log('📦 Orders DB initialized from seed file');
} else {
  console.log('📦 Orders DB already exists');
}
