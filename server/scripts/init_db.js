const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function run() {
  const root = path.join(__dirname, '..', '..');
  const dataDir = path.join(root, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, 'db.sqlite');

  const db = await open({ filename: dbFile, driver: sqlite3.Database });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await db.exec(schema);

  // seed sample categories and items if empty
  const c = await db.get('SELECT COUNT(*) as cnt FROM categories');
  if (c.cnt === 0) {
    await db.run('INSERT INTO categories (name) VALUES (?)', 'Getränke');
    await db.run('INSERT INTO categories (name) VALUES (?)', 'Speisen');

    await db.run('INSERT INTO items (category_id, name, price, available) VALUES (?,?,?,?)', [1, 'Wasser', 2.5, 1]);
    await db.run('INSERT INTO items (category_id, name, price, available) VALUES (?,?,?,?)', [1, 'Bier', 3.5, 1]);
    await db.run('INSERT INTO items (category_id, name, price, available) VALUES (?,?,?,?)', [2, 'Pommes', 4.0, 1]);
    await db.run('INSERT INTO items (category_id, name, price, available) VALUES (?,?,?,?)', [2, 'Burger', 8.5, 1]);
  }

  // seed tables if missing
  try {
    const t = await db.get('SELECT COUNT(*) as cnt FROM tables');
    if (t.cnt === 0) {
      await db.run('INSERT INTO tables (number) VALUES (?)', '1');
      await db.run('INSERT INTO tables (number) VALUES (?)', '2');
      await db.run('INSERT INTO tables (number) VALUES (?)', '3');
    }
  } catch (err) {
    // ignore if table doesn't exist yet (older schema)
  }

  console.log('Database initialized at', dbFile);
  // ensure 'paid' column exists on order_items (migration for older DBs)
  try {
    const cols = await db.all("PRAGMA table_info('order_items')");
    if (!cols.find(c => c.name === 'paid')) {
      await db.run('ALTER TABLE order_items ADD COLUMN paid INTEGER DEFAULT 0');
      console.log('Migration: added paid column to order_items');
    }
  } catch (err) {
    console.warn('Could not run migration for paid column:', err.message || err);
  }
  await db.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
