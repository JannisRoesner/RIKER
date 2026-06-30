// Reusable regression smoke test for RIKER. Run against a live server:
//   $env:PORT=3999; node index.js   (in one terminal)
//   node _smoke.js 3999              (in another)
// Exits non-zero if any check fails. Cleans up the test order it creates.
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const PORT = process.argv[2] || process.env.SMOKE_PORT || '3999';
const base = `http://localhost:${PORT}`;
const DB_FILE = path.join(__dirname, '..', 'data', 'db.sqlite');

let failures = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
  return ok;
}

async function main() {
  // --- Public endpoints ---
  const menu = await (await fetch(base + '/api/menu')).json();
  check('GET /api/menu is array', Array.isArray(menu), `categories=${menu.length}`);
  const tables = await (await fetch(base + '/api/tables')).json();
  check('GET /api/tables is array', Array.isArray(tables), `tables=${tables.length}`);
  const pub = await (await fetch(base + '/api/settings')).json();
  check('GET /api/settings has guestOrderingEnabled', typeof pub.guestOrderingEnabled === 'boolean');

  // --- Auth ---
  let r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'admin' }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  check('POST /api/auth/login 200 + cookie', r.status === 200 && !!cookie);
  const auth = { Cookie: cookie, 'Content-Type': 'application/json' };

  // Admin gate without cookie -> 401
  r = await fetch(base + '/api/admin/items');
  check('admin gate rejects anonymous (401)', r.status === 401, `status=${r.status}`);

  // --- Reports ---
  r = await fetch(base + '/api/admin/reports/timeseries', { headers: { Cookie: cookie } });
  check('GET timeseries 200 + array', r.status === 200 && Array.isArray(await r.json()));
  const sum = await (await fetch(base + '/api/admin/reports/summary', { headers: { Cookie: cookie } })).json();
  check('GET summary has revenuePaid', typeof sum.revenuePaid === 'number');

  // --- .docx pricelist ---
  r = await fetch(base + '/api/admin/export-pricelist', { headers: { Cookie: cookie } });
  const docxBuf = Buffer.from(await r.arrayBuffer());
  check('GET export-pricelist .docx valid zip', r.status === 200 && docxBuf.slice(0, 2).toString() === 'PK', `bytes=${docxBuf.length}`);

  // --- Products Excel export -> import round-trip ---
  const itemsBefore = await (await fetch(base + '/api/admin/items', { headers: { Cookie: cookie } })).json();
  r = await fetch(base + '/api/admin/export-products?mode=current', { headers: { Cookie: cookie } });
  const xlsxBuf = Buffer.from(await r.arrayBuffer());
  const isXlsxZip = xlsxBuf.slice(0, 2).toString() === 'PK';
  check('GET export-products current valid xlsx', r.status === 200 && isXlsxZip, `bytes=${xlsxBuf.length}`);

  const fd = new FormData();
  fd.append('file', new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'roundtrip.xlsx');
  r = await fetch(base + '/api/admin/import-products', { method: 'POST', headers: { Cookie: cookie }, body: fd });
  const imp = await r.json();
  check('POST import-products round-trip ok', r.status === 200 && imp.success >= itemsBefore.length && (!imp.errors || imp.errors.length === 0), `success=${imp.success} errors=${imp.errors ? imp.errors.length : 0}`);

  const itemsAfter = await (await fetch(base + '/api/admin/items', { headers: { Cookie: cookie } })).json();
  const norm = arr => arr.map(i => `${i.name}|${i.category || ''}|${Number(i.price).toFixed(2)}|${i.note_options || ''}`).sort().join('\n');
  check('product set unchanged after round-trip', norm(itemsBefore) === norm(itemsAfter), `before=${itemsBefore.length} after=${itemsAfter.length}`);

  // --- Guest order flow ---
  await fetch(base + '/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ guestOrderingEnabled: true }) });
  const adminSettings = await (await fetch(base + '/api/admin/settings', { headers: { Cookie: cookie } })).json();
  check('admin settings reflects guest enabled', adminSettings.guestOrderingEnabled === true);

  const firstItem = menu.flatMap(c => c.items)[0];
  const firstTable = tables[0];
  let createdOrderId = null;
  if (firstItem && firstTable) {
    r = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableNumber: firstTable.number, items: [{ id: firstItem.id, qty: 1, notes: '' }], guest: true, customerName: 'SmokeTest' }) });
    const ord = await r.json();
    createdOrderId = ord.id;
    check('guest order accepted when enabled', r.status === 200 && !!ord.id, `id=${ord.id}`);

    // verify it is stored as guest with GAST waiter
    const db = await open({ filename: DB_FILE, driver: sqlite3.Database });
    const row = await db.get('SELECT is_guest, waiter, customer_name FROM orders WHERE id = ?', ord.id);
    check('guest order stored as GAST', row && row.is_guest === 1 && /^GAST /.test(row.waiter || '') && row.customer_name === 'SmokeTest', JSON.stringify(row));

    // disable -> guest order rejected 403
    await fetch(base + '/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ guestOrderingEnabled: false }) });
    r = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableNumber: firstTable.number, items: [{ id: firstItem.id, qty: 1 }], guest: true, customerName: 'Blocked' }) });
    check('guest order rejected when disabled (403)', r.status === 403, `status=${r.status}`);

    // cleanup created order + restore guest flag default off
    await db.run('DELETE FROM order_items WHERE order_id = ?', createdOrderId);
    await db.run('DELETE FROM orders WHERE id = ?', createdOrderId);
    await db.run("UPDATE app_settings SET value = '0' WHERE key = 'guest_ordering_enabled'");
    await db.close();
  } else {
    check('guest order flow (item+table available)', false, 'no item/table to test');
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('SMOKE ERROR', e); process.exit(1); });
