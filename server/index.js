const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const multer = require('multer');
const XLSX = require('xlsx');

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

  // Migration: ensure items has 'note_options' column
  try {
    const cols = await db.all("PRAGMA table_info('items')");
    if (!cols.find(c => c.name === 'note_options')) {
      await db.run('ALTER TABLE items ADD COLUMN note_options TEXT');
      console.log('Migration: added note_options column to items');
    }
  } catch (err) {
    console.warn('Migration check failed:', err.message || err);
  }

  // Migration: ensure orders has 'waiter' column
  try {
    const cols = await db.all("PRAGMA table_info('orders')");
    if (!cols.find(c => c.name === 'waiter')) {
      await db.run('ALTER TABLE orders ADD COLUMN waiter TEXT');
      console.log('Migration: added waiter column to orders');
    }
  } catch (err) {
    console.warn('Migration check failed:', err.message || err);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());
  
  // Configure multer for file uploads (max 10MB)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  // Serve built frontend
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  // API
  app.get('/api/menu', async (req, res) => {
    const items = await db.all(`SELECT i.id, i.name, i.price, i.available, i.note_options, c.id as category_id, c.name as category
      FROM items i JOIN categories c ON i.category_id = c.id
      ORDER BY c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC`);
    // group by category
    const cats = {};
    items.forEach(it => {
      if (!cats[it.category_id]) cats[it.category_id] = { id: it.category_id, name: it.category, items: [] };
      const noteOptions = it.note_options ? it.note_options.split(',').map(s => s.trim()).filter(Boolean) : [];
      cats[it.category_id].items.push({ id: it.id, name: it.name, price: it.price, available: !!it.available, noteOptions });
    });
    res.json(Object.values(cats));
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const { tableNumber, items, waiter } = req.body;
      if (!tableNumber || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'tableNumber and items required' });

      // calculate total from items referencing menu price
      let total = 0;
      for (const it of items) {
        const row = await db.get('SELECT price FROM items WHERE id = ?', it.id);
        const price = row ? row.price : 0;
        total += price * (it.qty || 1);
      }

      const result = await db.run('INSERT INTO orders (table_number, waiter, total, status, created_at) VALUES (?,?,?,?,datetime("now"))', [tableNumber, waiter || null, total, 'open']);
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
      if (waiter) lines.push(`Kellner: ${waiter}`);
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
    // attach items with category info
    for (const o of rows) {
      o.items = await db.all(`SELECT oi.*, i.name, i.price, i.category_id, c.name as category FROM order_items oi JOIN items i ON oi.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE oi.order_id = ? ORDER BY c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC`, o.id);
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
    const { category_id, name, price, available, note_options } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await db.run('INSERT INTO items (category_id, name, price, available, note_options) VALUES (?,?,?,?,?)', [category_id||null, name, price||0, available?1:0, note_options||null]);
    res.json({ id: result.lastID });
  });

  app.put('/api/admin/items/:id', async (req, res) => {
    const id = req.params.id; const { category_id, name, price, available, note_options } = req.body;
    await db.run('UPDATE items SET category_id = ?, name = ?, price = ?, available = ?, note_options = ? WHERE id = ?', [category_id||null, name, price||0, available?1:0, note_options||null, id]);
    res.json({ ok: true });
  });

  app.delete('/api/admin/items/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const ref = await db.get('SELECT COUNT(*) as cnt FROM order_items WHERE item_id = ?', id);
      if (ref && ref.cnt > 0) {
        return res.status(409).json({ error: 'Item kann nicht gelöscht werden, da Bestellungen darauf verweisen', references: ref.cnt });
      }

      await db.run('DELETE FROM items WHERE id = ?', id);
      res.json({ ok: true });
    } catch (err) {
      console.error('delete item error', err);
      res.status(500).json({ error: 'internal' });
    }
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
    const { number, range } = req.body;
    
    // Handle range input (e.g., "1-30" or "1 - 30")
    if (range) {
      const match = String(range).trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (!match) return res.status(400).json({ error: 'invalid range format, use "1-30"' });
      
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      
      if (start > end) return res.status(400).json({ error: 'start must be <= end' });
      
      const results = [];
      for (let i = start; i <= end; i++) {
        const result = await db.run('INSERT INTO tables (number) VALUES (?)', String(i));
        results.push({ id: result.lastID, number: String(i) });
      }
      return res.json(results);
    }
    
    // Handle single table
    if (!number) return res.status(400).json({ error: 'number or range required' });
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
      let query, params;
      if (date) {
        query = `SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON oi.item_id = i.id
         WHERE COALESCE(oi.paid,0) = 1 AND DATE(o.created_at) = DATE(?)`;
        params = [date];
      } else {
        query = `SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON oi.item_id = i.id
         WHERE COALESCE(oi.paid,0) = 1`;
        params = [];
      }
      const row = await db.get(query, ...params);
      res.json({ date: date || null, revenuePaid: row?.revenuePaid || 0 });
    } catch (err) {
      console.error('report summary error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Summary revenue including unpaid items (all items total)
  app.get('/api/admin/reports/summary-all', async (req, res) => {
    try {
      const date = (req.query.date || '').trim();
      let query, params;
      if (date) {
        query = `SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenueAll
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON oi.item_id = i.id
         WHERE DATE(o.created_at) = DATE(?)`;
        params = [date];
      } else {
        query = `SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenueAll
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON oi.item_id = i.id`;
        params = [];
      }
      const row = await db.get(query, ...params);
      res.json({ date: date || null, revenueAll: row?.revenueAll || 0 });
    } catch (err) {
      console.error('report summary-all error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Orders for a date (or all if no date)
  app.get('/api/admin/reports/orders', async (req, res) => {
    try {
      const date = (req.query.date || '').trim();
      let query, params;
      if (date) {
        query = `SELECT * FROM orders WHERE DATE(created_at) = DATE(?) ORDER BY created_at DESC`;
        params = [date];
      } else {
        query = `SELECT * FROM orders ORDER BY created_at DESC`;
        params = [];
      }
      const rows = await db.all(query, ...params);
      res.json(rows);
    } catch (err) {
      console.error('report orders error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Per-item sales for a date (or all if no date): total sold qty and paid revenue
  app.get('/api/admin/reports/items', async (req, res) => {
    try {
      const date = (req.query.date || '').trim();
      let query, params;
      if (date) {
        query = `SELECT i.id as item_id, i.name,
                COALESCE(SUM(oi.qty),0) as soldQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN oi.qty ELSE 0 END),0) as paidQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN (oi.qty * i.price) ELSE 0 END),0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON i.id = oi.item_id
         WHERE DATE(o.created_at) = DATE(?)
         GROUP BY i.id, i.name
         ORDER BY soldQty DESC`;
        params = [date];
      } else {
        query = `SELECT i.id as item_id, i.name,
                COALESCE(SUM(oi.qty),0) as soldQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN oi.qty ELSE 0 END),0) as paidQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN (oi.qty * i.price) ELSE 0 END),0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON i.id = oi.item_id
         GROUP BY i.id, i.name
         ORDER BY soldQty DESC`;
        params = [];
      }
      const rows = await db.all(query, ...params);
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

  // Admin: Export product template as Excel
  app.get('/api/admin/export-template', async (req, res) => {
    try {
      // Get current categories and products for template
      const categories = await db.all('SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC');
      const items = await db.all(`
        SELECT i.*, c.name as category
        FROM items i LEFT JOIN categories c ON i.category_id = c.id
        ORDER BY c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC
      `);
      
      // Create workbook with template sheet
      const ws_data = [
        ['Produktname', 'Kategorie', 'Preis', 'Optionen'],
      ];
      
      // Add existing products as examples
      items.forEach(item => {
        ws_data.push([
          item.name,
          item.category || '',
          item.price,
          item.note_options || ''
        ]);
      });
      
      // Add example template rows if no data exists
      if (items.length === 0) {
        ws_data.push(['A-Sauer', 'Getränke', 3.00, '']);
        ws_data.push(['A-Süß', 'Getränke', 3.00, '']);
        ws_data.push(['Aperol', 'Getränke', 7.50, '']);
        ws_data.push(['Apfelschorle', 'Getränke', 2.50, '']);
        ws_data.push(['Cola', 'Getränke', 2.50, '']);
        ws_data.push(['Rotwein (Flasche)', 'Getränke', 15.00, '']);
        ws_data.push(['Rotwein (glas)', 'Getränke', 4.50, '']);
        ws_data.push(['Brezelchen', 'Speisen', 3.00, '']);
        ws_data.push(['Brötchen', 'Speisen', 3.00, 'Mett, Salami, Schinken, Käse']);
        ws_data.push(['Fleischwurst', 'Speisen', 4.00, 'Ketchup,Senf']);
        ws_data.push(['Pommes', 'Speisen', 3.00, 'Ketchup,Mayo']);
        ws_data.push(['Rindsowurst', 'Speisen', 4.00, 'Ketchup,Senf']);
      }
      
      // Add a few empty rows for new products
      for (let i = 0; i < 5; i++) {
        ws_data.push(['', '', '', '']);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      
      // Format header row (bold, background)
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F4E78' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };
      
      // Apply header style to first row
      for (let col = 0; col < 4; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
        ws[cellRef].s = headerStyle;
      }
      
      // Format data rows with borders and alignment
      for (let row = 1; row < ws_data.length; row++) {
        for (let col = 0; col < 4; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              alignment: { horizontal: col === 0 ? 'left' : 'center', vertical: 'center', wrapText: true },
              border: {
                top: { style: 'thin', color: { rgb: 'CCCCCC' } },
                bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
                left: { style: 'thin', color: { rgb: 'CCCCCC' } },
                right: { style: 'thin', color: { rgb: 'CCCCCC' } }
              },
              numFmt: col === 2 ? '0.00' : '@'  // Format price column as decimal
            };
          }
        }
      }
      
      // Set column widths
      ws['!cols'] = [
        { wch: 30 },  // Produktname
        { wch: 15 },  // Kategorie
        { wch: 10 },  // Preis
        { wch: 40 }   // Optionen
      ];
      
      // Freeze header row
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Produkte');
      
      // Send as file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=produkte-template.xlsx');
      
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      res.send(buffer);
    } catch (err) {
      console.error('Export error:', err);
      res.status(500).json({ error: err.message || 'Export failed' });
    }
  });

  // Admin: Import products from Excel
  app.post('/api/admin/import-products', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      
      // Parse Excel file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: 'No data found in spreadsheet' });
      }
      
      // Validate and prepare data
      const results = { success: 0, errors: [] };
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNum = i + 2; // +2 because headers are row 1, data starts at row 2
        
        // Extract and trim values
        const name = (row['Produktname'] || row['Name'] || '').trim();
        const categoryName = (row['Kategorie'] || row['Category'] || '').trim();
        const priceStr = String(row['Preis'] || row['Price'] || '0').trim().replace(',', '.');
        const noteOptions = (row['Optionen'] || row['Options'] || '').trim();
        
        // Validation
        if (!name) {
          results.errors.push({ line: lineNum, error: 'Produktname fehlt' });
          continue;
        }
        
        const price = parseFloat(priceStr);
        if (isNaN(price)) {
          results.errors.push({ line: lineNum, error: `Ungültiger Preis: "${priceStr}"` });
          continue;
        }
        
        try {
          // Get or create category
          let categoryId = null;
          if (categoryName) {
            let category = await db.get('SELECT id FROM categories WHERE name = ?', categoryName);
            if (!category) {
              const result = await db.run('INSERT INTO categories (name) VALUES (?)', categoryName);
              categoryId = result.lastID;
            } else {
              categoryId = category.id;
            }
          }
          
          // Check if product already exists
          const existing = await db.get(
            'SELECT id FROM items WHERE name = ? AND category_id = ?',
            [name, categoryId]
          );
          
          if (existing) {
            // Update existing product
            await db.run(
              'UPDATE items SET price = ?, note_options = ? WHERE id = ?',
              [price, noteOptions || null, existing.id]
            );
          } else {
            // Insert new product
            await db.run(
              'INSERT INTO items (name, category_id, price, available, note_options) VALUES (?, ?, ?, 1, ?)',
              [name, categoryId, price, noteOptions || null]
            );
          }
          
          results.success++;
        } catch (err) {
          results.errors.push({ line: lineNum, error: err.message });
        }
      }
      
      res.json(results);
    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ error: err.message || 'Import failed' });
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
