const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const multer = require('multer');
const ExcelJS = require('exceljs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  Header, ImageRun, TabStopType, TabStopPosition, LeaderType,
  HorizontalPositionAlign, VerticalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom
} = require('docx');
const { buildCompleteReport } = require('./reportPdf');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.sqlite');
const PRINTS_DIR = path.join(__dirname, '..', 'prints');

async function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRINTS_DIR)) fs.mkdirSync(PRINTS_DIR, { recursive: true });
}

const PRICE_LIST_FONT = 'Calibri';

function generatedStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function pngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function fitImage(natural, maxWidth, maxHeight) {
  const w = (natural && natural.width) || 1;
  const h = (natural && natural.height) || 1;
  const scale = Math.min(maxWidth / w, maxHeight / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function loadBildmarke() {
  const p = findBildmarkePath();
  return p ? fs.readFileSync(p) : null;
}

function findBildmarkePath() {
  const candidates = [
    path.join(__dirname, 'public', 'bildmarke.png'),
    path.join(__dirname, '..', 'client', 'public', 'bildmarke.png'),
    path.join(__dirname, '..', 'client', 'src', 'bildmarke.png')
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

// Read an ExcelJS cell as plain text (handles rich text and formula results)
function cellText(cell) {
  const v = cell ? cell.value : null;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

// Minimal CSV line parser supporting quoted fields and escaped quotes
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
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

  // Migration: ensure items has 'color' column
  try {
    const cols = await db.all("PRAGMA table_info('items')");
    if (!cols.find(c => c.name === 'color')) {
      await db.run('ALTER TABLE items ADD COLUMN color TEXT');
      console.log('Migration: added color column to items');
    }
  } catch (err) {
    console.warn('Migration check failed:', err.message || err);
  }

  // Migration: ensure orders has guest columns
  try {
    const cols = await db.all("PRAGMA table_info('orders')");
    if (!cols.find(c => c.name === 'is_guest')) {
      await db.run('ALTER TABLE orders ADD COLUMN is_guest INTEGER DEFAULT 0');
      console.log('Migration: added is_guest column to orders');
    }
    if (!cols.find(c => c.name === 'customer_name')) {
      await db.run('ALTER TABLE orders ADD COLUMN customer_name TEXT');
      console.log('Migration: added customer_name column to orders');
    }
  } catch (err) {
    console.warn('Migration check failed:', err.message || err);
  }

  // Ensure guest ordering setting exists (default off)
  try {
    const existing = await db.get('SELECT value FROM app_settings WHERE key = ?', 'guest_ordering_enabled');
    if (!existing) {
      await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', ['guest_ordering_enabled', '0']);
    }
  } catch (err) {
    console.warn('Guest setting init failed:', err.message || err);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'riker-admin-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }));

  let adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const passwordSetting = await db.get('SELECT value FROM app_settings WHERE key = ?', 'admin_password');
  if (passwordSetting && typeof passwordSetting.value === 'string' && passwordSetting.value.length > 0) {
    adminPassword = passwordSetting.value;
  } else {
    await db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['admin_password', adminPassword]
    );
  }
  if (!process.env.ADMIN_PASSWORD && adminPassword === 'admin') {
    console.warn('⚠️  WARNUNG: Kein ADMIN_PASSWORD gesetzt. Standard-Passwort "admin" wird verwendet.');
  }
  
  // Configure multer for file uploads (max 10MB)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  // Serve built frontend
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  // API
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Passwort erforderlich' });
    }
    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Falsches Passwort' });
    }
    req.session.authenticated = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session-Fehler' });
      res.json({ success: true });
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Logout fehlgeschlagen' });
      res.json({ success: true });
    });
  });

  app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    if (!req.session || !req.session.authenticated) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }

    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: 'Ungültige Passwort-Daten (mindestens 4 Zeichen erforderlich)' });
    }

    if (currentPassword !== adminPassword) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }

    adminPassword = newPassword;
    await db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['admin_password', newPassword]
    );

    res.json({ success: true });
  });

  app.get('/api/menu', async (req, res) => {
    const items = await db.all(`SELECT i.id, i.name, i.price, i.available, i.note_options, i.color, c.id as category_id, c.name as category
      FROM items i JOIN categories c ON i.category_id = c.id
      ORDER BY c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC`);
    // group by category
    const cats = {};
    items.forEach(it => {
      if (!cats[it.category_id]) cats[it.category_id] = { id: it.category_id, name: it.category, items: [] };
      const noteOptions = it.note_options ? it.note_options.split(',').map(s => s.trim()).filter(Boolean) : [];
      cats[it.category_id].items.push({ id: it.id, name: it.name, price: it.price, available: !!it.available, noteOptions, color: it.color || null });
    });
    res.json(Object.values(cats));
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const { tableNumber, items, waiter, guest, customerName } = req.body;
      if (!tableNumber || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'tableNumber and items required' });

      // Guest self-ordering: only allowed when feature is enabled
      let isGuest = 0;
      let resolvedCustomerName = null;
      let resolvedWaiter = waiter || null;
      if (guest) {
        const setting = await db.get('SELECT value FROM app_settings WHERE key = ?', 'guest_ordering_enabled');
        if (!setting || setting.value !== '1') {
          return res.status(403).json({ error: 'Gäste-Bestellung ist deaktiviert' });
        }
        const name = (customerName || '').trim();
        if (!name) return res.status(400).json({ error: 'Name erforderlich' });
        isGuest = 1;
        resolvedCustomerName = name;
        resolvedWaiter = `GAST ${name}`;
      }

      // calculate total from items referencing menu price
      let total = 0;
      for (const it of items) {
        const row = await db.get('SELECT price FROM items WHERE id = ?', it.id);
        const price = row ? row.price : 0;
        total += price * (it.qty || 1);
      }

      const result = await db.run('INSERT INTO orders (table_number, waiter, total, status, created_at, is_guest, customer_name) VALUES (?,?,?,?,datetime("now"),?,?)', [tableNumber, resolvedWaiter, total, 'open', isGuest, resolvedCustomerName]);
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
      if (isGuest) {
        lines.push('*** GASTBESTELLUNG ***');
        lines.push(`GAST: ${resolvedCustomerName}`);
      } else if (resolvedWaiter) {
        lines.push(`Bedienung: ${resolvedWaiter}`);
      }
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

  // Public endpoint for table selection (Bestellen + Bezahlen)
  app.get('/api/tables', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM tables ORDER BY CAST(number AS INTEGER) ASC, number ASC');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'db error' });
    }
  });

  // Public settings (feature flags visible to clients)
  app.get('/api/settings', async (req, res) => {
    try {
      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', 'guest_ordering_enabled');
      res.json({ guestOrderingEnabled: row ? row.value === '1' : false });
    } catch (err) {
      res.status(500).json({ error: 'db error' });
    }
  });

  function requireAdminAuth(req, res, next) {
    if (!req.session || !req.session.authenticated) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    next();
  }

  app.use('/api/admin', requireAdminAuth);

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
    const { category_id, name, price, available, note_options, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await db.run('INSERT INTO items (category_id, name, price, available, note_options, color) VALUES (?,?,?,?,?,?)', [category_id||null, name, price||0, available?1:0, note_options||null, color||null]);
    res.json({ id: result.lastID });
  });

  app.put('/api/admin/items/:id', async (req, res) => {
    const id = req.params.id; const { category_id, name, price, available, note_options, color } = req.body;
    await db.run('UPDATE items SET category_id = ?, name = ?, price = ?, available = ?, note_options = ?, color = ? WHERE id = ?', [category_id||null, name, price||0, available?1:0, note_options||null, color||null, id]);
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

  // Revenue time series (paid items grouped by time bucket of order creation)
  app.get('/api/admin/reports/timeseries', async (req, res) => {
    try {
      // Bucket size in minutes (default 30)
      const bucket = Math.max(1, Math.min(1440, parseInt(req.query.bucket, 10) || 30));
      const rows = await db.all(
        `SELECT o.created_at, COALESCE(oi.paid,0) as paid, (oi.qty * i.price) as amount
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON oi.item_id = i.id
         WHERE o.created_at IS NOT NULL
         ORDER BY o.created_at ASC`
      );
      // Group in JS into buckets to build cumulative + per-bucket revenue
      const map = new Map();
      const bucketMs = bucket * 60 * 1000;
      for (const r of rows) {
        const t = Date.parse((r.created_at || '').replace(' ', 'T') + 'Z');
        if (isNaN(t)) continue;
        const slot = Math.floor(t / bucketMs) * bucketMs;
        if (!map.has(slot)) map.set(slot, { t: slot, paid: 0, all: 0 });
        const entry = map.get(slot);
        entry.all += r.amount;
        if (r.paid === 1) entry.paid += r.amount;
      }
      const series = Array.from(map.values()).sort((a, b) => a.t - b.t);
      let cumPaid = 0, cumAll = 0;
      const out = series.map(s => {
        cumPaid += s.paid; cumAll += s.all;
        const d = new Date(s.t);
        const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return { time: label, paid: Number(s.paid.toFixed(2)), all: Number(s.all.toFixed(2)), cumPaid: Number(cumPaid.toFixed(2)), cumAll: Number(cumAll.toFixed(2)) };
      });
      res.json(out);
    } catch (err) {
      console.error('report timeseries error', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Admin: read/update app settings (feature flags)
  app.get('/api/admin/settings', async (req, res) => {
    try {
      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', 'guest_ordering_enabled');
      res.json({ guestOrderingEnabled: row ? row.value === '1' : false });
    } catch (err) {
      res.status(500).json({ error: 'db error' });
    }
  });

  app.post('/api/admin/settings', async (req, res) => {
    try {
      const { guestOrderingEnabled } = req.body || {};
      if (typeof guestOrderingEnabled === 'boolean') {
        await db.run(
          'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['guest_ordering_enabled', guestOrderingEnabled ? '1' : '0']
        );
      }
      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', 'guest_ordering_enabled');
      res.json({ guestOrderingEnabled: row ? row.value === '1' : false });
    } catch (err) {
      res.status(500).json({ error: 'db error' });
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

  async function exportProducts(req, res, forceMode) {
    try {
      const mode = forceMode || (req.query.mode === 'current' ? 'current' : 'template');

      // Rows as [name, category, price, options]
      let dataRows;
      if (mode === 'current') {
        const items = await db.all(`
          SELECT i.*, c.name as category
          FROM items i LEFT JOIN categories c ON i.category_id = c.id
          ORDER BY c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC
        `);
        dataRows = items.map(item => [item.name, item.category || '', item.price, item.note_options || '']);
      } else {
        dataRows = [
          ['A-Sauer', 'Getränke', 3.00, ''],
          ['A-Süß', 'Getränke', 3.00, ''],
          ['Aperol', 'Getränke', 7.50, ''],
          ['Apfelschorle', 'Getränke', 2.50, ''],
          ['Cola', 'Getränke', 2.50, ''],
          ['Rotwein (Flasche)', 'Getränke', 15.00, ''],
          ['Rotwein (glas)', 'Getränke', 4.50, ''],
          ['Brezelchen', 'Speisen', 3.00, ''],
          ['Brötchen', 'Speisen', 3.00, 'Mett, Salami, Schinken, Käse'],
          ['Fleischwurst', 'Speisen', 4.00, 'Ketchup,Senf'],
          ['Pommes', 'Speisen', 3.00, 'Ketchup,Mayo'],
          ['Rindsowurst', 'Speisen', 4.00, 'Ketchup,Senf']
        ];
        for (let i = 0; i < 5; i++) dataRows.push(['', '', '', '']);
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Produkte', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [
        { header: 'Produktname', key: 'name', width: 30 },
        { header: 'Kategorie', key: 'category', width: 15 },
        { header: 'Preis', key: 'price', width: 10 },
        { header: 'Optionen', key: 'options', width: 40 }
      ];

      // Header row styling (bold white on dark blue, centered, bordered)
      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      dataRows.forEach(r => {
        const row = ws.addRow({ name: r[0], category: r[1], price: r[2], options: r[3] });
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
          };
          if (colNumber === 3) cell.numFmt = '0.00';
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const filename = mode === 'current' ? 'produkte-export.xlsx' : 'produkte-template.xlsx';
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      const buffer = await wb.xlsx.writeBuffer();
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error('Export error:', err);
      res.status(500).json({ error: err.message || 'Export failed' });
    }
  }

  // Admin: Export products as Excel (mode=template|current)
  // Wrap so Express does not pass `next` as the third arg (which previously forced template mode)
  app.get('/api/admin/export-products', (req, res) => exportProducts(req, res));

  // Admin: Complete PDF report (overview + orders + sold items)
  app.get('/api/admin/export-report', async (req, res) => {
    try {
      const [paidRow, allRow, orders, items, tsRows, products] = await Promise.all([
        db.get(`SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenuePaid
                FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN items i ON oi.item_id = i.id
                WHERE COALESCE(oi.paid,0) = 1`),
        db.get(`SELECT COALESCE(SUM(oi.qty * i.price), 0) as revenueAll
                FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN items i ON oi.item_id = i.id`),
        db.all(`SELECT * FROM orders ORDER BY created_at DESC`),
        db.all(`SELECT i.id as item_id, i.name,
                COALESCE(SUM(oi.qty),0) as soldQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN oi.qty ELSE 0 END),0) as paidQty,
                COALESCE(SUM(CASE WHEN COALESCE(oi.paid,0)=1 THEN (oi.qty * i.price) ELSE 0 END),0) as revenuePaid
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN items i ON i.id = oi.item_id
         GROUP BY i.id, i.name
         ORDER BY soldQty DESC`),
        db.all(
          `SELECT o.created_at, COALESCE(oi.paid,0) as paid, (oi.qty * i.price) as amount
           FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           JOIN items i ON oi.item_id = i.id
           WHERE o.created_at IS NOT NULL
           ORDER BY o.created_at ASC`
        ),
        db.all(`SELECT i.name, i.price, i.available, i.note_options, c.name as category
                FROM items i LEFT JOIN categories c ON i.category_id = c.id
                ORDER BY (c.name IS NULL) ASC, c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC`)
      ]);

      const bucketMs = 30 * 60 * 1000;
      const map = new Map();
      for (const r of tsRows) {
        const t = Date.parse((r.created_at || '').replace(' ', 'T') + 'Z');
        if (isNaN(t)) continue;
        const slot = Math.floor(t / bucketMs) * bucketMs;
        if (!map.has(slot)) map.set(slot, { t: slot, paid: 0, all: 0 });
        const entry = map.get(slot);
        entry.all += r.amount;
        if (r.paid === 1) entry.paid += r.amount;
      }
      const seriesSorted = Array.from(map.values()).sort((a, b) => a.t - b.t);
      let cumPaid = 0, cumAll = 0;
      const series = seriesSorted.map(s => {
        cumPaid += s.paid; cumAll += s.all;
        const d = new Date(s.t);
        const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return { time: label, cumPaid: Number(cumPaid.toFixed(2)), cumAll: Number(cumAll.toFixed(2)) };
      });

      const buffer = await buildCompleteReport({
        summaryPaid: paidRow?.revenuePaid || 0,
        summaryAll: allRow?.revenueAll || 0,
        orders,
        items,
        products,
        series,
        generatedAt: new Date(),
        logoPath: findBildmarkePath()
      });

      const stamp = generatedStamp();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=riker-komplettbericht-${stamp}.pdf`);
      res.send(buffer);
    } catch (err) {
      console.error('Complete report export error:', err);
      res.status(500).json({ error: err.message || 'Export failed' });
    }
  });

  // Admin: Export price list as Word (.docx) — title "Speisen und Getränke" with Bildmarke watermark
  app.get('/api/admin/export-pricelist', async (req, res) => {
    try {
      const items = await db.all(`
        SELECT i.name, i.price, c.name as category
        FROM items i LEFT JOIN categories c ON i.category_id = c.id
        WHERE COALESCE(i.available, 1) = 1
        ORDER BY (c.name IS NULL) ASC, c.name COLLATE NOCASE ASC, i.name COLLATE NOCASE ASC
      `);

      // Group items by category
      const groups = new Map();
      for (const it of items) {
        const cat = it.category || 'Sonstiges';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(it);
      }

      const logoBuffer = loadBildmarke();

      // Build a centered, behind-text watermark that keeps the logo's native aspect ratio
      let header;
      if (logoBuffer) {
        const natural = pngSize(logoBuffer) || { width: 420, height: 420 };
        const transformation = fitImage(natural, 520, 520);
        header = new Header({
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  type: 'png',
                  data: logoBuffer,
                  transformation,
                  floating: {
                    horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
                    verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
                    behindDocument: true,
                    allowOverlap: true
                  }
                })
              ]
            })
          ]
        });
      }

      const children = [];
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: 'Speisen und Getränke', bold: true, size: 56, font: PRICE_LIST_FONT })]
      }));

      for (const [cat, list] of groups) {
        children.push(new Paragraph({
          spacing: { before: 280, after: 120 },
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: cat, bold: true, size: 32, font: PRICE_LIST_FONT })]
        }));
        for (const it of list) {
          const price = (Number(it.price) || 0).toFixed(2).replace('.', ',') + ' €';
          children.push(new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
            spacing: { after: 80 },
            children: [
              new TextRun({ text: it.name, size: 24, font: PRICE_LIST_FONT }),
              new TextRun({ text: `\t${price}`, size: 24, bold: true, font: PRICE_LIST_FONT })
            ]
          }));
        }
      }

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: PRICE_LIST_FONT, size: 24 }
            },
            heading1: {
              run: { font: PRICE_LIST_FONT, bold: true, size: 32 }
            }
          }
        },
        sections: [{
          headers: header ? { default: header } : undefined,
          children
        }]
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename=speisen-und-getraenke.docx');
      res.send(buffer);
    } catch (err) {
      console.error('Pricelist export error:', err);
      res.status(500).json({ error: err.message || 'Export failed' });
    }
  });

  // Backward-compatible endpoint for template export
  app.get('/api/admin/export-template', async (req, res) => {
    await exportProducts(req, res, 'template');
  });

  // Admin: Import products from Excel (.xlsx) or CSV
  app.post('/api/admin/import-products', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      // Build a list of { values: {header->text}, line } records from xlsx or csv
      const records = [];
      const fileName = (req.file.originalname || '').toLowerCase();

      if (fileName.endsWith('.csv')) {
        const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/);
        if (lines.length === 0 || lines[0].trim() === '') {
          return res.status(400).json({ error: 'No data found in spreadsheet' });
        }
        const headers = parseCsvLine(lines[0]).map(h => h.trim());
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '') continue;
          const cells = parseCsvLine(lines[i]);
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = cells[idx] != null ? cells[idx] : ''; });
          records.push({ values: obj, line: i + 1 });
        }
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No data found in spreadsheet' });
        const headers = [];
        worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = cellText(cell).trim(); });
        for (let r = 2; r <= worksheet.rowCount; r++) {
          const row = worksheet.getRow(r);
          const obj = {};
          for (let col = 1; col < headers.length; col++) {
            const key = headers[col];
            if (!key) continue;
            obj[key] = cellText(row.getCell(col));
          }
          records.push({ values: obj, line: r });
        }
      }

      if (records.length === 0) {
        return res.status(400).json({ error: 'No data found in spreadsheet' });
      }

      // Validate and prepare data
      const results = { success: 0, errors: [] };

      for (const rec of records) {
        const row = rec.values;
        const lineNum = rec.line;

        // Extract and trim values
        const name = String(row['Produktname'] || row['Name'] || '').trim();
        const categoryName = String(row['Kategorie'] || row['Category'] || '').trim();
        const priceStr = String(row['Preis'] || row['Price'] || '0').trim().replace(',', '.');
        const noteOptions = String(row['Optionen'] || row['Options'] || '').trim();

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

  // fallback to index.html for client-side routing (Express 5: use middleware instead of '*')
  app.use((req, res) => {
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
