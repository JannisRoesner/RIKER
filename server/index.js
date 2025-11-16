const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.sqlite');
const PRINTS_DIR = path.join(__dirname, '..', 'prints');

async function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRINTS_DIR)) fs.mkdirSync(PRINTS_DIR, { recursive: true });
}

async function start() {
  await ensureDirs();

  const db = await open({ filename: DB_FILE, driver: sqlite3.Database });

  // Ensure schema exists (if init script wasn't run)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.exec(schema);

  // Migration: ensure order_items has 'paid' column
  try {
    const cols = await db.all("PRAGMA table_info('order_items')");
    if (!cols.find(c => c.name === 'paid')) {
      await db.run('ALTER TABLE order_items ADD COLUMN paid INTEGER DEFAULT 0');
      console.log('Migration: added paid column to order_items');
    }
  } catch (err) {
    console.warn('Migration check failed:', err.message || err);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serve built frontend
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  // API
  app.get('/api/menu', async (req, res) => {
    const items = await db.all(`SELECT i.id, i.name, i.price, i.available, c.id as category_id, c.name as category
      FROM items i JOIN categories c ON i.category_id = c.id
      ORDER BY c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC`);
    // group by category
    const cats = {};
    items.forEach(it => {
      if (!cats[it.category_id]) cats[it.category_id] = { id: it.category_id, name: it.category, items: [] };
      cats[it.category_id].items.push({ id: it.id, name: it.name, price: it.price, available: !!it.available });
    });
    res.json(Object.values(cats));
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const { tableNumber, items } = req.body;
      if (!tableNumber || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'tableNumber and items required' });

      // calculate total from items referencing menu price
      let total = 0;
      for (const it of items) {
        const row = await db.get('SELECT price FROM items WHERE id = ?', it.id);
        const price = row ? row.price : 0;
        total += price * (it.qty || 1);
      }

      const result = await db.run('INSERT INTO orders (table_number, total, status, created_at) VALUES (?,?,?,datetime("now"))', [tableNumber, total, 'open']);
      const orderId = result.lastID;

      const insertItem = await db.prepare('INSERT INTO order_items (order_id, item_id, qty, notes) VALUES (?,?,?,?)');
      for (const it of items) {
        await insertItem.run(orderId, it.id, it.qty || 1, it.notes || '');
      }
      await insertItem.finalize();

      // print bon
      const ts = Date.now();
      const filename = `order-${orderId}-${ts}.txt`;
      const lines = [];
      lines.push(`Bestellung #${orderId}`);
      lines.push(`Tisch: ${tableNumber}`);
      lines.push('---');
      for (const it of items) {
        const row = await db.get('SELECT name, price FROM items WHERE id = ?', it.id);
        const name = row ? row.name : 'unknown';
        const price = row ? row.price : 0;
        lines.push(`${it.qty || 1} x ${name} (${price} je) ${it.notes ? '- ' + it.notes : ''}`);
      }
      lines.push('---');
      lines.push(`Summe: ${total.toFixed(2)}€`);

      fs.writeFileSync(path.join(PRINTS_DIR, filename), lines.join('\n'));

      res.json({ id: orderId, total });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/orders', async (req, res) => {
    const { status } = req.query;
    let rows;
    if (status) rows = await db.all('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC', status);
    else rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    // attach items
    for (const o of rows) {
      o.items = await db.all('SELECT oi.*, i.name, i.price FROM order_items oi JOIN items i ON oi.item_id = i.id WHERE oi.order_id = ?', o.id);
    }
    res.json(rows);
  });

  // Admin endpoints: categories, items, tables
  app.get('/api/admin/categories', async (req, res) => {
    const rows = await db.all('SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC');
    res.json(rows);
  });

  app.post('/api/admin/categories', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await db.run('INSERT INTO categories (name) VALUES (?)', name);
    res.json({ id: result.lastID, name });
  });

  app.put('/api/admin/categories/:id', async (req, res) => {
    const id = req.params.id; const { name } = req.body;
    await db.run('UPDATE categories SET name = ? WHERE id = ?', name, id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/categories/:id', async (req, res) => {
    const id = req.params.id;
    await db.run('DELETE FROM categories WHERE id = ?', id);
    res.json({ ok: true });
  });

  app.get('/api/admin/items', async (req, res) => {
    const rows = await db.all(`
      SELECT i.*, c.name as category
      FROM items i LEFT JOIN categories c ON i.category_id = c.id
      ORDER BY (c.name IS NULL) ASC, c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC, i.id ASC
    `);
    res.json(rows);
  });

  app.post('/api/admin/items', async (req, res) => {
    const { category_id, name, price, available } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await db.run('INSERT INTO items (category_id, name, price, available) VALUES (?,?,?,?)', [category_id||null, name, price||0, available?1:0]);
    res.json({ id: result.lastID });
  });

  app.put('/api/admin/items/:id', async (req, res) => {
    const id = req.params.id; const { category_id, name, price, available } = req.body;
    await db.run('UPDATE items SET category_id = ?, name = ?, price = ?, available = ? WHERE id = ?', [category_id||null, name, price||0, available?1:0, id]);
    res.json({ ok: true });
  });

  app.delete('/api/admin/items/:id', async (req, res) => {
    const id = req.params.id;
    await db.run('DELETE FROM items WHERE id = ?', id);
    res.json({ ok: true });
  });

  app.get('/api/admin/tables', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM tables ORDER BY CAST(number AS INTEGER) ASC, number ASC');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'db error' });
    }
  });

  app.post('/api/admin/tables', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'number required' });
    const result = await db.run('INSERT INTO tables (number) VALUES (?)', number);
    res.json({ id: result.lastID, number });
  });

  app.put('/api/admin/tables/:id', async (req, res) => {
    const id = req.params.id; const { number } = req.body;
    await db.run('UPDATE tables SET number = ? WHERE id = ?', [number, id]);
    res.json({ ok: true });
  });

  app.delete('/api/admin/tables/:id', async (req, res) => {
    const id = req.params.id;
    await db.run('DELETE FROM tables WHERE id = ?', id);
    res.json({ ok: true });
  });

  app.post('/api/orders/:id/pay', async (req, res) => {
    const id = req.params.id;
    await db.run('UPDATE orders SET status = ? WHERE id = ?', 'paid', id);
    res.json({ ok: true });
  });

  app.post('/api/orders/:id/complete', async (req, res) => {
    const id = req.params.id;
    await db.run('UPDATE orders SET status = ? WHERE id = ?', 'complete', id);
    res.json({ ok: true });
  });

  // Pay selected order_items for an order (body: { itemIds: [1,2,3] })
  app.post('/api/orders/:id/pay-items', async (req, res) => {
    const orderId = req.params.id;
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ error: 'itemIds required' });
    const placeholders = itemIds.map(() => '?').join(',');
    try {
      await db.run(`UPDATE order_items SET paid = 1 WHERE order_id = ? AND id IN (${placeholders})`, [orderId, ...itemIds]);

      // if all items are now paid, mark order as paid
      const unpaid = await db.get('SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND (paid IS NULL OR paid = 0)', orderId);
      if (unpaid && unpaid.cnt === 0) {
        await db.run('UPDATE orders SET status = ? WHERE id = ?', 'paid', orderId);
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('pay-items error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Combined view of unpaid items for a table across all orders
  // Returns each item individually (qty expanded to separate rows) for fine-grained payment selection
  app.get('/api/tables/:number/items', async (req, res) => {
    const tableNumber = req.params.number;
    try {
      const rows = await db.all(
        `SELECT oi.id as id, oi.order_id, oi.qty, oi.notes, COALESCE(oi.paid,0) as paid,
                i.name, i.price,
                o.table_number
         FROM order_items oi
         JOIN items i ON oi.item_id = i.id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.table_number = ? AND COALESCE(oi.paid,0) = 0
         ORDER BY o.created_at ASC, oi.id ASC`,
        tableNumber
      );
      
      // Expand rows so each qty unit becomes a separate entry for individual selection
      const expanded = [];
      rows.forEach(row => {
        for (let i = 0; i < row.qty; i++) {
          expanded.push({
            id: `${row.id}-${i}`,  // unique ID per unit
            order_item_id: row.id,  // original order_item id for backend reference
            order_id: row.order_id,
            name: row.name,
            price: row.price,
            notes: row.notes,
            table_number: row.table_number
          });
        }
      });
      
      res.json(expanded);
    } catch (err) {
      console.error('table items error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Pay selected items across all orders of a table
  // Expects itemIds array with format ["123-0", "123-1", ...] where 123 is order_item_id
  app.post('/api/tables/:number/pay-items', async (req, res) => {
    const tableNumber = req.params.number;
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ error: 'itemIds required' });
    
    try {
      // Parse expanded IDs back to order_item_ids and count how many of each
      const counts = {};
      itemIds.forEach(id => {
        const match = String(id).match(/^(\d+)-\d+$/);
        if (match) {
          const oiId = parseInt(match[1], 10);
          counts[oiId] = (counts[oiId] || 0) + 1;
        }
      });
      
      const orderItemIds = Object.keys(counts).map(k => parseInt(k, 10));
      if (orderItemIds.length === 0) return res.status(400).json({ error: 'no valid item ids' });
      
      // Validate these order_items belong to the table
      const placeholders = orderItemIds.map(() => '?').join(',');
      const valid = await db.all(
        `SELECT oi.id, oi.order_id, oi.item_id, oi.qty, oi.notes, COALESCE(oi.paid,0) as paid FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.table_number = ? AND oi.id IN (${placeholders})`,
        [tableNumber, ...orderItemIds]
      );
      
      if (valid.length === 0) return res.status(400).json({ error: 'no valid items for table' });
      
      // Handle partial payments by splitting order_items
      const affectedOrderIds = new Set();
      for (const row of valid) {
        const selectedCount = counts[row.id] || 0;
        if (selectedCount >= row.qty) {
          // All units selected: mark fully paid
          await db.run('UPDATE order_items SET paid = 1 WHERE id = ?', row.id);
          affectedOrderIds.add(row.order_id);
        } else if (selectedCount > 0 && selectedCount < row.qty) {
          // Partial payment: split the row
          // 1. Create new paid row with selectedCount
          await db.run(
            'INSERT INTO order_items (order_id, item_id, qty, notes, paid) VALUES (?, ?, ?, ?, 1)',
            [row.order_id, row.item_id, selectedCount, row.notes]
          );
          // 2. Update original row to remaining unpaid qty
          const remaining = row.qty - selectedCount;
          await db.run('UPDATE order_items SET qty = ? WHERE id = ?', [remaining, row.id]);
          affectedOrderIds.add(row.order_id);
        }
      }
      
      // Mark orders as paid if no unpaid items remain
      for (const oid of affectedOrderIds) {
        const unpaid = await db.get('SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND COALESCE(paid,0) = 0', oid);
        if (unpaid && unpaid.cnt === 0) {
          await db.run('UPDATE orders SET status = ? WHERE id = ?', 'paid', oid);
        }
      }
      
      res.json({ ok: true, processed: valid.length });
    } catch (err) {
      console.error('table pay-items error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // --- Admin reports ---
  // Summary revenue for a date (paid items only)
  app.get('/api/admin/reports/summary', async (req, res) => {
    try {
      const date = (req.query.date || '').trim();
      const dateExpr = date ? `DATE(?)` : `DATE('now')`;
      const params = date ? [date] : [];
      const row = await db.get(
        `SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON oi.item_id = i.id
         WHERE COALESCE(oi.paid,0) = 1 AND DATE(o.created_at) = ${dateExpr}`,
        ...params
      );
      res.json({ date: date || null, revenuePaid: row?.revenuePaid || 0 });
    } catch (err) {
      console.error('report summary error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Orders for a date
  app.get('/api/admin/reports/orders', async (req, res) => {
    try {
      const date = (req.query.date || '').trim();
      const dateExpr = date ? `DATE(?)` : `DATE('now')`;
      const params = date ? [date] : [];
      const rows = await db.all(
        `SELECT * FROM orders WHERE DATE(created_at) = ${dateExpr} ORDER BY created_at DESC`,
        ...params
      );
      res.json(rows);
    } catch (err) {
      console.error('report orders error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Per-item sales for a date: total sold qty and paid revenue
  app.get('/api/admin/reports/items', async (req, res) => {
    try {
      const date = (req.query.date || '').trim();
      const dateExpr = date ? `DATE(?)` : `DATE('now')`;
      const params = date ? [date] : [];
      const rows = await db.all(
        `SELECT i.id as item_id, i.name,
                COALESCE(SUM(oi.qty),0) as soldQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN oi.qty ELSE 0 END),0) as paidQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN (oi.qty * i.price) ELSE 0 END),0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON i.id = oi.item_id
         WHERE DATE(o.created_at) = ${dateExpr}
         GROUP BY i.id, i.name
         ORDER BY soldQty DESC`,
        ...params
      );
      res.json(rows);
    } catch (err) {
      console.error('report items error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Admin: Reset all orders (dangerous)
  app.post('/api/admin/reset', async (req, res) => {
    try {
      // Delete all orders (order_items are ON DELETE CASCADE)
      await db.run('DELETE FROM orders');
      // Try to reset autoincrement counters (optional)
      try { await db.run("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items')"); } catch {}
      // Remove printed tickets
      try {
        if (fs.existsSync(PRINTS_DIR)) {
          const files = fs.readdirSync(PRINTS_DIR);
          for (const f of files) {
            if (f.startsWith('order-') && (f.endsWith('.txt') || f.endsWith('.pdf'))) {
              try { fs.unlinkSync(path.join(PRINTS_DIR, f)); } catch {}
            }
          }
        }
      } catch {}
      res.json({ ok: true });
    } catch (err) {
      console.error('admin reset error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // fallback to index.html for client-side routing
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(publicDir, 'index.html'))) res.sendFile(path.join(publicDir, 'index.html'));
    else res.status(404).send('Not found');
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

start().catch(err => {
  console.error('Failed to start', err);
  process.exit(1);
});
