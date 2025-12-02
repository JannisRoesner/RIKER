import React, { useEffect, useState } from 'react'
import logo from './bildmarke.png'

function TablePicker({ tables, value, onChange }) {
  return (
    <div className="panel">
      <div className="form-row" style={{gap:12}}>
        <label>Tischnummer wählen</label>
        <select value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— bitte wählen —</option>
          {tables.map(t => (
            <option key={t.id} value={t.number}>{t.number}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// Touch-optimierter Tischauswahl-Dialog (Grid + Suche + Pagination)
function TableSelector({ tables, value, onSelect, onClose }) {
  const [page, setPage] = useState(0)
  const pageSize = 24
  const sorted = [...tables].sort((a,b) => (parseInt(a.number,10)||0) - (parseInt(b.number,10)||0))
  const filtered = sorted
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages-1)
  const slice = filtered.slice(currentPage*pageSize, currentPage*pageSize + pageSize)

  function pick(num) {
    onSelect(num)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{width:560, maxWidth:'100%'}}>
        <h3>Tisch auswählen</h3>
        <div className="selector-bar" style={{justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={onClose}>Schließen</button>
        </div>

        <div className="table-grid">
          {slice.map(t => (
            <button key={t.id} className={`table-btn ${String(value)===String(t.number)?'active':''}`} onClick={()=>pick(t.number)}>
              <div className="num">{t.number}</div>
            </button>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pager">
            <button className="btn btn-ghost btn-sm" disabled={currentPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Zurück</button>
            <span className="muted">Seite {currentPage+1} / {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={currentPage===totalPages-1} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))}>Weiter</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TableSelectControl({ tables, value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="panel">
      <div className="form-row" style={{justifyContent:'space-between'}}>
        <div>
          <div className="muted" style={{marginBottom:4}}>Aktueller Tisch</div>
          <div style={{fontWeight:700, fontSize:18}}>{value ? `Tisch ${value}` : '— keiner —'}</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          {value ? <button className="btn btn-ghost" onClick={() => onChange('')}>Leeren</button> : null}
          <button className="btn btn-primary" onClick={() => setOpen(true)}>{value? 'Ändern' : 'Tisch wählen'}</button>
        </div>
      </div>
      {open && (
        <TableSelector tables={tables} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

function MenuGrid({ menu, onSelectItem }) {
  return (
    <div className="menu-grid">
      {menu.map(cat => (
        <div key={cat.id} className="category">
          <h3>{cat.name}</h3>
          <div className="items">
            {cat.items.map(it => (
              <button key={it.id} className="item" onClick={() => onSelectItem({ ...it, categoryName: cat.name })}>
                <div>{it.name}</div>
                <small>{it.price.toFixed(2)}€</small>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Cart({ items, onRemove, onSubmit, table }) {
  const total = items.reduce((s, it) => s + it.price * it.qty, 0)
  return (
    <div className="panel" style={{minWidth:280}}>
      <h2>Bestellung Tischnr {table}</h2>
      <ul>
        {items.map((it, idx) => (
          <li key={idx}>
            <div style={{flex:1}}>{it.qty}× {it.name} {it.notes ? `(${it.notes})` : ''}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onRemove(idx)}>Entfernen</button>
          </li>
        ))}
      </ul>
      <div className="total">Summe: {total.toFixed(2)}€</div>
      <button className="btn btn-primary btn-block" disabled={items.length===0 || !table} onClick={() => onSubmit()}>Bestellung abschicken</button>
    </div>
  )
}

export default function App() {
  const [table, setTable] = useState('')
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [currentSelection, setCurrentSelection] = useState(null) // item selected to set qty/notes
  const [view, setView] = useState('order')
  const [tables, setTables] = useState([])

  useEffect(() => {
    fetch('/api/menu').then(r => r.json()).then(setMenu)
    fetch('/api/admin/tables').then(r=>r.json()).then(ts => setTables(ts))
  }, [])

  function changeTable(newTable) {
    if (newTable === table) return;
    if (cart.length > 0) {
      const ok = confirm('Tisch wechseln? Der aktuelle Warenkorb wird geleert.')
      if (!ok) return;
      setCart([])
    }
    setTable(newTable)
  }

  function addItem(it) {
    setCart(c => [...c, it])
  }

  function removeItem(idx) {
    setCart(c => c.filter((_, i) => i !== idx))
  }

  async function submitOrder() {
    const body = { tableNumber: table, items: cart.map(i => ({ id: i.id, qty: i.qty, notes: i.notes })) }
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    alert('Bestellung gesendet — Nr. ' + data.id + '\nSumme: ' + data.total.toFixed(2) + '€')
    setCart([])
    // Nach dem Abschicken Tisch automatisch leeren
    setTable('')
  }

  return (
    <div className="app">
      <header>
        <div className="bar container">
          <div className="logo-section">
            <img src={logo} alt="RIKER Bildmarke" className="logo-image" />
            <div className="logo-text">
              <div className="logo-title">RIKER</div>
              <div className="logo-subtitle">
                <span>Registrierkassen-Interface für Karnevalssitzungen</span><br />
                <span>mit Echtzeit-Rückmeldungen</span>
              </div>
            </div>
          </div>
          <nav className="tabs">
            <button className={`tab ${view==='order'?'active':''}`} onClick={() => setView('order')}>Bestellen</button>
            <button className={`tab ${view==='service'?'active':''}`} onClick={() => setView('service')}>Bezahlen</button>
            <button className={`tab ${view==='kitchen'?'active':''}`} onClick={() => setView('kitchen')}>Küche</button>
            <button className={`tab ${view==='admin'?'active':''}`} onClick={() => setView('admin')}>Admin</button>
          </nav>
        </div>
      </header>
      <main className="page container">
        {view === 'order' && (
          <div>
            <TableSelectControl tables={tables} value={table} onChange={changeTable} />
            {table ? (
              <div className="layout">
                <MenuGrid menu={menu} onSelectItem={it => setCurrentSelection(it)} />
                <Cart items={cart} onRemove={removeItem} onSubmit={submitOrder} table={table} />
              </div>
            ) : (
              <div className="panel">
                <h2>Bitte Tisch wählen</h2>
                <div className="muted">Wähle zuerst einen Tisch, um Artikel zu sehen und zu bestellen.</div>
              </div>
            )}
          </div>
        )}

        {view === 'kitchen' && <Kitchen />}
        {view === 'service' && <Service />}
        {view === 'admin' && <Admin onRefreshMenu={() => fetch('/api/menu').then(r=>r.json()).then(setMenu)} />}
      </main>

      {currentSelection && (
        <OrderModal
          item={currentSelection}
          onCancel={() => setCurrentSelection(null)}
          onAdd={(qty, notes) => { if (!table) { alert('Bitte zuerst einen Tisch wählen.'); return; } addItem({ id: currentSelection.id, name: currentSelection.name, price: currentSelection.price, qty, notes }); setCurrentSelection(null) }}
        />
      )}
    </div>
  )
}

function OrderModal({ item, onCancel, onAdd }) {
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')
  const isDrink = (item?.categoryName || '').toLowerCase().includes('geträn')
  const placeholder = isDrink
    ? 'z.B. ohne Eis, wenig Kohlensäure, mit Zitrone'
    : 'z.B. ohne Zwiebeln, extra scharf'
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{item.name}</h3>
        <div>
          <label>Menge</label>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <button className="btn btn-secondary" onClick={()=>setQty(q=>Math.max(1,q-1))}>−</button>
            <input type="number" min="1" value={qty} onChange={e=>setQty(parseInt(e.target.value||'1',10))} style={{flex:1, textAlign:'center'}} />
            <button className="btn btn-secondary" onClick={()=>setQty(q=>q+1)}>+</button>
          </div>
        </div>
        <div>
          <label>Sonderwünsche</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder={placeholder} />
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => onAdd(qty, notes)}>Hinzufügen</button>
          <button className="btn btn-ghost" onClick={onCancel}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}

function Kitchen() {
  const [orders, setOrders] = useState([])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const os = await (await fetch('/api/orders?status=open')).json()
        if (cancelled) return
        setOrders(os)
      } catch {}
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  async function markDone(id) {
    await fetch(`/api/orders/${id}/complete`, { method: 'POST' })
    setOrders(orders.filter(o=>o.id!==id))
  }

  return (
    <div className="panel">
      <h2>Küchen-Tickets</h2>
      {orders.map(o => (
        <div key={o.id} className="ticket">
          <div>Bestellung #{o.id} — Tisch {o.table_number} — {o.total.toFixed(2)}€</div>
          <ul>
            {(o.items||[]).map(it => (
              <li key={it.id}>
                {it.qty}× {it.name} {it.notes ? <small>({it.notes})</small> : null}
              </li>
            ))}
          </ul>
          <button className="btn btn-success" onClick={() => markDone(o.id)}>Erledigt</button>
        </div>
      ))}
    </div>
  )
}

function Service() {
  const [tables, setTables] = useState([])
  const [table, setTable] = useState('')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    fetch('/api/admin/tables').then(r=>r.json()).then(setTables)
  }, [])

  useEffect(() => {
    if (!table) { setItems([]); setSelected(new Set()); return }
    fetch(`/api/tables/${encodeURIComponent(table)}/items`).then(r=>r.json()).then(rows => { 
      setItems(rows); 
      setSelected(new Set()) 
    })
  }, [table])

  function toggle(id) {
    setSelected(s => { const c = new Set([...s]); if (c.has(id)) c.delete(id); else c.add(id); return c; })
  }

  const total = items.reduce((sum, it) => selected.has(it.id) ? sum + it.price : sum, 0)

  async function paySelected() {
    const ids = Array.from(selected)
    if (!table || ids.length === 0) return
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/pay-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds: ids }) })
    if (!res.ok) { alert('Bezahlen fehlgeschlagen'); return }
    // reload items
    const rows = await (await fetch(`/api/tables/${encodeURIComponent(table)}/items`)).json()
    setItems(rows); setSelected(new Set())
  }

  return (
    <div className="panel">
      <h2>Bezahlen — Tisch bezahlen</h2>
      <TableSelectControl tables={tables} value={table} onChange={setTable} />
      {!table ? <div>Bitte Tisch wählen</div> : (
        <div>
          <div className="pay-head">
            <div></div>
            <div className="muted">Artikel</div>
            <div className="muted align-right">Preis</div>
          </div>
          <ul className="pay-list">
            {items.map(it => (
              <li key={it.id}>
                <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                <div className="pay-desc">
                  <div className="line">
                    <span className="badge">#{it.order_id}</span>
                    <span>1× {it.name}</span>
                  </div>
                  {it.notes ? <div className="muted" style={{fontSize:12}}>{it.notes}</div> : null}
                </div>
                <div className="pay-price">{it.price.toFixed(2)}€</div>
              </li>
            ))}
          </ul>
          <div className="pay-actions">
            <strong>Summe: {total.toFixed(2)}€</strong>
            <button className="btn btn-primary" onClick={paySelected} disabled={selected.size===0}>Bezahlen</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Admin({ onRefreshMenu }) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [tables, setTables] = useState([])
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0,10))
  const [newCat, setNewCat] = useState('')
  const [newItem, setNewItem] = useState({ name: '', category_id: '', price: '' })
  const [newTable, setNewTable] = useState('')
  const [showReset, setShowReset] = useState(false)

  useEffect(() => { load(); }, [])
  function load() {
    fetch('/api/admin/categories').then(r=>r.json()).then(setCategories)
    fetch('/api/admin/items').then(r=>r.json()).then(setItems)
    fetch('/api/admin/tables').then(r=>r.json()).then(setTables)
  }

  function tStatus(s) { return s==='paid' ? 'bezahlt' : s==='complete' ? 'fertig' : 'offen' }
  function fmtEuro(n) { return (Number(n)||0).toFixed(2) + '€' }

  async function openRevenueWindow() {
    const q = reportDate ? `?date=${encodeURIComponent(reportDate)}` : ''
    const data = await (await fetch('/api/admin/reports/summary'+q)).json()
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Umsatz ${reportDate}</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14} .big{font-size:28px;font-weight:800} .muted{color:#555}</style>
      </head><body>
      <h2>Umsatz (bezahlt) — ${reportDate}</h2>
      <div class="big">${fmtEuro(data.revenuePaid||0)}</div>
      <div class="muted">Basis: bezahlte Positionen des Tages</div>
      </body></html>`)
    w.document.close()
  }

  async function openOrdersWindow() {
    const q = reportDate ? `?date=${encodeURIComponent(reportDate)}` : ''
    const rows = await (await fetch('/api/admin/reports/orders'+q)).json()
    const w = window.open('', '_blank'); if (!w) return
    const head = `<!doctype html><html><head><meta charset="utf-8"><title>Bestellungen ${reportDate}</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14}
      table{border-collapse:collapse;width:100%} th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left} thead th{border-bottom:2px solid #ddd;color:#444}
      </style></head><body>`
    const rowsHtml = rows.map(o => `<tr><td>#${o.id}</td><td>${o.table_number||''}</td><td>${tStatus(o.status)}</td><td>${fmtEuro(o.total||0)}</td><td>${(o.created_at||'').replace('T',' ').slice(0,19)}</td></tr>`).join('')
    const body = `<h2>Bestellungen — ${reportDate}</h2><table><thead><tr><th>#</th><th>Tisch</th><th>Status</th><th>Summe</th><th>Zeit</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
    w.document.write(head + body + '</body></html>'); w.document.close()
  }

  async function openItemsWindow() {
    const q = reportDate ? `?date=${encodeURIComponent(reportDate)}` : ''
    const rows = await (await fetch('/api/admin/reports/items'+q)).json()
    const w = window.open('', '_blank'); if (!w) return
    const head = `<!doctype html><html><head><meta charset="utf-8"><title>Artikel ${reportDate}</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14}
      table{border-collapse:collapse;width:100%} th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left} thead th{border-bottom:2px solid #ddd;color:#444}
      </style></head><body>`
    const rowsHtml = rows.map(r => `<tr><td>${r.name}</td><td>${r.soldQty}</td><td>${r.paidQty}</td><td>${fmtEuro(r.revenuePaid||0)}</td></tr>`).join('')
    const body = `<h2>Verkaufte Artikel — ${reportDate}</h2><table><thead><tr><th>Artikel</th><th>Menge</th><th>Bezahlt (Menge)</th><th>Umsatz (bezahlt)</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
    w.document.write(head + body + '</body></html>'); w.document.close()
  }

  async function addCategory() {
    if (!newCat) return alert('Name required')
    await fetch('/api/admin/categories', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newCat }) })
    setNewCat('')
    load()
  }

  async function addItem() {
    if (!newItem.name) return alert('Name required')
    await fetch('/api/admin/items', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newItem.name, category_id: newItem.category_id || null, price: parseFloat(newItem.price)||0, available: 1 }) })
    setNewItem({ name: '', category_id: '', price: '' })
    load(); onRefreshMenu && onRefreshMenu()
  }

  async function addTable() {
    if (!newTable) return alert('Number required')
    await fetch('/api/admin/tables', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ number: newTable }) })
    setNewTable('')
    load()
  }

  async function delItem(id) { if (!confirm('löschen?')) return; await fetch('/api/admin/items/'+id, { method: 'DELETE' }); load(); onRefreshMenu && onRefreshMenu() }
  async function delCategory(id) { if (!confirm('löschen?')) return; await fetch('/api/admin/categories/'+id, { method: 'DELETE' }); load(); }
  async function delTable(id) { if (!confirm('löschen?')) return; await fetch('/api/admin/tables/'+id, { method: 'DELETE' }); load(); }

  return (
    <div className="admin-grid">
      <div className="panel">
        <h3>Reports</h3>
        <div className="form-row" style={{flexWrap:'wrap'}}>
          <label>Datum</label>
          <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} />
          <div style={{flex:1}} />
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="btn btn-secondary" onClick={openRevenueWindow}>Umsatz (bezahlt) anzeigen</button>
            <button className="btn btn-secondary" onClick={openOrdersWindow}>Bestellungen (Tag) öffnen</button>
            <button className="btn btn-secondary" onClick={openItemsWindow}>Verkaufte Artikel (Tag) öffnen</button>
            <button className="btn btn-danger" onClick={()=>setShowReset(true)}>Kasse auf Null setzen</button>
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>Kategorien</h3>
        <ul>{categories.map(c => <li key={c.id}><div style={{flex:1}}>{c.name}</div><button className="btn btn-danger btn-sm" onClick={() => delCategory(c.id)}>Löschen</button></li>)}</ul>
        <div className="form-row">
          <input placeholder="Neue Kategorie" value={newCat} onChange={e=>setNewCat(e.target.value)} />
          <button className="btn btn-primary" onClick={addCategory}>Hinzufügen</button>
        </div>
      </div>

      <div className="panel span-2">
        <h3>Produkte</h3>
        <ul>{items.map(it => <li key={it.id}><div style={{flex:1}}>{it.name} — {it.category||'—'} — {it.price}€</div><button className="btn btn-danger btn-sm" onClick={() => delItem(it.id)}>Löschen</button></li>)}</ul>
        <div className="form-row" style={{flexWrap:'wrap'}}>
          <input placeholder="Name" value={newItem.name} onChange={e=>setNewItem(s=>({...s,name:e.target.value}))} />
          <select value={newItem.category_id} onChange={e=>setNewItem(s=>({...s,category_id:e.target.value}))}>
            <option value="">(keine Kategorie)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Preis" value={newItem.price} onChange={e=>setNewItem(s=>({...s,price:e.target.value.replace(',','.')}))} />
          <button className="btn btn-primary" onClick={addItem}>Produkt hinzufügen</button>
        </div>
      </div>

      <div className="panel">
        <h3>Tische</h3>
        <ul>{tables.map(t => <li key={t.id}><div style={{flex:1}}>{t.number}</div><button className="btn btn-danger btn-sm" onClick={() => delTable(t.id)}>Löschen</button></li>)}</ul>
        <div className="form-row">
          <input placeholder="Tischnummer" value={newTable} onChange={e=>setNewTable(e.target.value)} />
          <button className="btn btn-primary" onClick={addTable}>Tisch hinzufügen</button>
        </div>
      </div>
      {showReset && (
        <AdminResetModal onClose={()=>setShowReset(false)} onConfirm={async ()=>{
          const sure = confirm('Wirklich alle Bestellungen löschen und Kasse auf Null setzen?')
          if (!sure) return
          const res = await fetch('/api/admin/reset', { method: 'POST' })
          if (res.ok) {
            alert('Kasse wurde zurückgesetzt.')
          } else {
            alert('Zurücksetzen fehlgeschlagen')
          }
          setShowReset(false)
        }} />
      )}
    </div>
  )
}

function AdminResetModal({ onClose, onConfirm }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h3>Alle Bestellungen löschen?</h3>
        <p>
          Diese Aktion setzt die Kasse auf <strong>Null</strong> und löscht <strong>alle Bestellungen</strong> (inkl. Positionen).
          Bitte nur unmittelbar <strong>vor dem Start der Sitzung und des Einlasses</strong> durchführen.
        </p>
        <p className="muted">Bon-Dateien im Ordner <code>prints/</code> werden ebenfalls entfernt.</p>
        <div className="actions">
          <button className="btn btn-danger" onClick={onConfirm}>Ja, alles löschen</button>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}
