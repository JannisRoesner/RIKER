import React, { useEffect, useState } from 'react'
import logo from './bildmarke.png'

function WaiterLoginModal({ onWaiterSet }) {
  const [name, setName] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (name.trim()) {
      localStorage.setItem('waiter', name.trim())
      onWaiterSet(name.trim())
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Willkommen bei RIKER</h3>
        <p className="muted">Bitte gib deinen Namen ein, um Bestellungen aufzugeben.</p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="waiter-name">Dein Name</label>
            <input
              id="waiter-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="z.B. Max"
              autoFocus
              style={{ width: '100%', padding: '8px 12px', fontSize: 16 }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim()}>
            Bestätigen
          </button>
        </form>
      </div>
    </div>
  )
}

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

function MenuGrid({ menu, onAddItem }) {
  return (
    <div className="menu-grid">
      {menu.map(cat => (
        <div key={cat.id} className="category">
          <h3>{cat.name}</h3>
          <div
            className="items"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              width: '100%'
            }}
          >
            {cat.items.map(it => (
              <button
                key={it.id}
                className="item"
                onClick={() => onAddItem(it)}
                style={{ width: '100%' }}
              >
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

function Cart({ items, onRemove, onSubmit, onEditNotes, table }) {
  const total = items.reduce((s, it) => s + it.price * it.qty, 0)
  return (
    <div className="panel" style={{minWidth:280}}>
      <h2>Bestellung Tischnr {table}</h2>
      <ul>
        {items.map((it, idx) => (
          <li key={idx}>
            <div style={{flex:1}}>
              {it.qty}× {it.name}
              {it.notes && <div className="muted" style={{fontSize:12,marginTop:2}}>{it.notes}</div>}
            </div>
            <div style={{display:'flex',gap:4}}>
              <button className="btn btn-ghost btn-sm" onClick={() => onEditNotes(idx)} title="Notizen bearbeiten">✏️</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onRemove(idx)}>✕</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="total">Summe: {total.toFixed(2)}€</div>
      <button className="btn btn-primary btn-block" disabled={items.length===0 || !table} onClick={() => onSubmit()}>Bestellung abschicken</button>
    </div>
  )
}

export default function App() {
  const [waiter, setWaiter] = useState(null)
  const [showWaiterModal, setShowWaiterModal] = useState(false)
  const [table, setTable] = useState('')
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [editingItem, setEditingItem] = useState(null) // {index, notes} or {newItem, notes} for editing notes
  const [view, setView] = useState('order')
  const [tables, setTables] = useState([])
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    // Load waiter from localStorage
    const savedWaiter = localStorage.getItem('waiter')
    if (savedWaiter) {
      setWaiter(savedWaiter)
    } else {
      setShowWaiterModal(true)
    }

    fetch('/api/menu').then(r => r.json()).then(setMenu)
    fetch('/api/admin/tables').then(r=>r.json()).then(ts => setTables(ts))
  }, [])

  function handleWaiterSet(name) {
    setWaiter(name)
    setShowWaiterModal(false)
  }

  function changeWaiter() {
    setShowWaiterModal(true)
  }

  function changeTable(newTable) {
    if (newTable === table) return;
    if (cart.length > 0) {
      const ok = confirm('Tisch wechseln? Der aktuelle Warenkorb wird geleert.')
      if (!ok) return;
      setCart([])
    }
    setTable(newTable)
  }

  function addItem(menuItem) {
    if (!table) {
      alert('Bitte zuerst einen Tisch wählen.')
      return
    }
    
    // If item has note options, open the modal first before adding to cart
    if (menuItem.noteOptions && menuItem.noteOptions.length > 0) {
      const newItem = { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1, notes: '', noteOptions: menuItem.noteOptions }
      setEditingItem({ newItem, notes: '' })
      return
    }
    
    setCart(c => {
      const idx = c.findIndex(it => it.id === menuItem.id && (it.notes||'') === '')
      if (idx >= 0) {
        return c.map((it,i) => i===idx ? { ...it, qty: it.qty + 1 } : it)
      }
      return [...c, { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1, notes: '', noteOptions: menuItem.noteOptions || [] }]
    })
  }

  function removeItem(idx) {
    setCart(c => c.filter((_, i) => i !== idx))
  }

  function startEditNotes(idx) {
    setEditingItem({ index: idx, notes: cart[idx].notes || '' })
  }

  function saveNotes() {
    if (editingItem === null) return
    
    // If editing a new item (not yet in cart), add it now with the notes
    if (editingItem.newItem) {
      const itemWithNotes = { ...editingItem.newItem, notes: editingItem.notes }
      setCart(c => {
        const idx = c.findIndex(it => it.id === itemWithNotes.id && (it.notes||'') === (itemWithNotes.notes||''))
        if (idx >= 0) {
          return c.map((it,i) => i===idx ? { ...it, qty: it.qty + 1 } : it)
        }
        return [...c, itemWithNotes]
      })
    } else {
      // Editing existing cart item
      setCart(c => c.map((it, i) => i === editingItem.index ? { ...it, notes: editingItem.notes } : it))
    }
    setEditingItem(null)
  }

  function changeView(v) {
    setView(v)
    setNavOpen(false)
  }

  async function submitOrder() {
    // Group identical items (same id + notes) into single lines
    const grouped = []
    for (const i of cart) {
      const keyIndex = grouped.findIndex(g => g.id === i.id && (g.notes||'') === (i.notes||''))
      if (keyIndex >= 0) { grouped[keyIndex].qty += i.qty }
      else { grouped.push({ id: i.id, qty: i.qty, notes: i.notes }) }
    }
    const body = { tableNumber: table, items: grouped, waiter }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {waiter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16, whiteSpace: 'nowrap' }}>
                <span className="muted" style={{ fontSize: 12 }}>Kellner:</span>
                <strong>{waiter}</strong>
                <button className="btn btn-ghost btn-sm" onClick={changeWaiter} title="Namen ändern">✏️</button>
              </div>
            )}
            <button className="hamburger" aria-label="Menü" onClick={()=>setNavOpen(o=>!o)}>
              <span></span><span></span><span></span>
            </button>
          </div>
          <nav className={`tabs ${navOpen ? 'open' : ''}`} role="navigation" aria-label="Hauptnavigation">
            <button className={`tab ${view==='order'?'active':''}`} onClick={() => changeView('order')}>Bestellen</button>
            <button className={`tab ${view==='service'?'active':''}`} onClick={() => changeView('service')}>Bezahlen</button>
            <button className={`tab ${view==='kitchen'?'active':''}`} onClick={() => changeView('kitchen')}>Küche</button>
            <button className={`tab ${view==='admin'?'active':''}`} onClick={() => changeView('admin')}>Admin</button>
          </nav>
        </div>
      </header>
      <main className="page container">
        {view === 'order' && (
          <div>
            <TableSelectControl tables={tables} value={table} onChange={changeTable} />
            {table ? (
              <div className="layout">
                <MenuGrid menu={menu} onAddItem={addItem} />
                <Cart items={cart} onRemove={removeItem} onEditNotes={startEditNotes} onSubmit={submitOrder} table={table} />
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

      {showWaiterModal && (
        <WaiterLoginModal onWaiterSet={handleWaiterSet} />
      )}

      {editingItem && (
        <EditNotesModal
          item={editingItem.newItem ? editingItem.newItem : cart[editingItem.index]}
          notes={editingItem.notes}
          onNotesChange={(notes) => setEditingItem({ ...editingItem, notes })}
          onCancel={() => setEditingItem(null)}
          onSave={saveNotes}
        />
      )}
    </div>
  )
}

function EditNotesModal({ item, notes, onNotesChange, onCancel, onSave }) {
  if (!item) {
    console.error('EditNotesModal: item is undefined!')
    return null
  }
  
  const noteOptions = item.noteOptions || [];
  
  function toggleOption(option) {
    const current = notes.split(',').map(s => s.trim()).filter(Boolean);
    const idx = current.indexOf(option);
    if (idx >= 0) {
      // Remove it
      current.splice(idx, 1);
    } else {
      // Add it
      current.push(option);
    }
    onNotesChange(current.join(', '));
  }
  
  const selectedOptions = notes.split(',').map(s => s.trim()).filter(Boolean);
  
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Sonderwünsche für {item.name}</h3>
        {noteOptions.length > 0 && (
          <div style={{marginBottom: 16}}>
            <label style={{display:'block', marginBottom: 8}}>Optionen wählen</label>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {noteOptions.map(opt => (
                <button
                  key={opt}
                  className={`btn ${selectedOptions.includes(opt) ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleOption(opt)}
                  type="button"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label>Zusätzliche Notizen</label>
          <textarea 
            value={notes} 
            onChange={e => onNotesChange(e.target.value)} 
            placeholder="z.B. ohne Zwiebeln, extra scharf, ohne Eis..."
          />
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onSave}>Speichern</button>
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
          <div>Bestellung #{o.id} — {o.waiter ? `Kellner: ${o.waiter} — ` : ''}Tisch {o.table_number} — {o.total.toFixed(2)}€</div>
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
              <li key={it.id} onClick={() => toggle(it.id)} style={{cursor:'pointer'}}>
                <input type="checkbox" checked={selected.has(it.id)} onChange={(e) => { e.stopPropagation(); toggle(it.id) }} />
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
  const [newCat, setNewCat] = useState('')
  const [newItem, setNewItem] = useState({ name: '', category_id: '', price: '', note_options: '' })
  const [newTable, setNewTable] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [editingItemOptions, setEditingItemOptions] = useState(null)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => { load(); }, [])
  function load() {
    fetch('/api/admin/categories').then(r=>r.json()).then(setCategories)
    fetch('/api/admin/items').then(r=>r.json()).then(setItems)
    fetch('/api/admin/tables').then(r=>r.json()).then(setTables)
  }

  function tStatus(s) { return s==='paid' ? 'bezahlt' : s==='complete' ? 'fertig' : 'offen' }
  function fmtEuro(n) { return (Number(n)||0).toFixed(2) + '€' }

  async function openRevenueWindow() {
    const data = await (await fetch('/api/admin/reports/summary')).json()
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Umsatz (Gesamt)</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14} .big{font-size:28px;font-weight:800} .muted{color:#555}</style>
      </head><body>
      <h2>Umsatz (bezahlt) — Gesamt</h2>
      <div class="big">${fmtEuro(data.revenuePaid||0)}</div>
      <div class="muted">Basis: alle bezahlten Positionen in der Datenbank</div>
      </body></html>`)
    w.document.close()
  }

  async function openRevenueAllWindow() {
    const data = await (await fetch('/api/admin/reports/summary-all')).json()
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Umsatz (Alle Positionen)</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14} .big{font-size:28px;font-weight:800} .muted{color:#555}</style>
      </head><body>
      <h2>Umsatz (alle Positionen) — Gesamt</h2>
      <div class="big">${fmtEuro(data.revenueAll||0)}</div>
      <div class="muted">Basis: alle Positionen (bezahlt und nicht bezahlt)</div>
      </body></html>`)
    w.document.close()
  }

  async function openOrdersWindow() {
    const rows = await (await fetch('/api/admin/reports/orders')).json()
    const w = window.open('', '_blank'); if (!w) return
    const head = `<!doctype html><html><head><meta charset="utf-8"><title>Bestellungen (Gesamt)</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14}
      table{border-collapse:collapse;width:100%} th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left} thead th{border-bottom:2px solid #ddd;color:#444}
      </style></head><body>`
    const rowsHtml = rows.map(o => `<tr><td>#${o.id}</td><td>${o.table_number||''}</td><td>${tStatus(o.status)}</td><td>${fmtEuro(o.total||0)}</td><td>${(o.created_at||'').replace('T',' ').slice(0,19)}</td></tr>`).join('')
    const body = `<h2>Bestellungen — Gesamt</h2><table><thead><tr><th>#</th><th>Tisch</th><th>Status</th><th>Summe</th><th>Zeit</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
    w.document.write(head + body + '</body></html>'); w.document.close()
  }

  async function openItemsWindow() {
    const rows = await (await fetch('/api/admin/reports/items')).json()
    const w = window.open('', '_blank'); if (!w) return
    const head = `<!doctype html><html><head><meta charset="utf-8"><title>Artikel (Gesamt)</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:16px;color:#0b0f14}
      table{border-collapse:collapse;width:100%} th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left} thead th{border-bottom:2px solid #ddd;color:#444}
      </style></head><body>`
    const rowsHtml = rows.map(r => `<tr><td>${r.name}</td><td>${r.soldQty}</td><td>${r.paidQty}</td><td>${fmtEuro(r.revenuePaid||0)}</td></tr>`).join('')
    const body = `<h2>Verkaufte Artikel — Gesamt</h2><table><thead><tr><th>Artikel</th><th>Menge</th><th>Bezahlt (Menge)</th><th>Umsatz (bezahlt)</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
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
    await fetch('/api/admin/items', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newItem.name, category_id: newItem.category_id || null, price: parseFloat(newItem.price)||0, available: 1, note_options: newItem.note_options || null }) })
    setNewItem({ name: '', category_id: '', price: '', note_options: '' })
    load(); onRefreshMenu && onRefreshMenu()
  }

  async function addTable() {
    if (!newTable) return alert('Number or range required')
    
    // Check if input is a range (e.g., "1-30")
    if (newTable.includes('-')) {
      const res = await fetch('/api/admin/tables', { 
        method: 'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ range: newTable }) 
      })
      if (!res.ok) {
        const err = await res.json()
        return alert('Error: ' + (err.error || 'unknown error'))
      }
    } else {
      // Single table
      await fetch('/api/admin/tables', { 
        method: 'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ number: newTable }) 
      })
    }
    setNewTable('')
    load()
  }

  async function delItem(id) { if (!confirm('löschen?')) return; await fetch('/api/admin/items/'+id, { method: 'DELETE' }); load(); onRefreshMenu && onRefreshMenu() }
  async function delCategory(id) { if (!confirm('löschen?')) return; await fetch('/api/admin/categories/'+id, { method: 'DELETE' }); load(); }
  async function delTable(id) { if (!confirm('löschen?')) return; await fetch('/api/admin/tables/'+id, { method: 'DELETE' }); load(); }

  async function downloadTemplate() {
    try {
      const res = await fetch('/api/admin/export-template')
      if (!res.ok) throw new Error('Download fehlgeschlagen')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'produkte-template.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Fehler beim Download: ' + err.message)
    }
  }

  return (
    <div className="admin-grid">
      <div className="panel">
        <h3>Reports</h3>
        <div className="form-row" style={{flexWrap:'wrap'}}>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="btn btn-secondary" onClick={openRevenueWindow}>Umsatz (bezahlt) anzeigen</button>
            <button className="btn btn-secondary" onClick={openOrdersWindow}>Bestellungen öffnen</button>
            <button className="btn btn-secondary" onClick={openRevenueAllWindow}>Umsatz gesamt (inkl. unbezahlte)</button>
            <button className="btn btn-secondary" onClick={openItemsWindow}>Verkaufte Artikel öffnen</button>
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
        <div style={{marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          <button className="btn btn-secondary" onClick={downloadTemplate}>Vorlage herunterladen</button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>Preisliste hochladen</button>
        </div>
        <ul>{items.map(it => <li key={it.id}><div style={{flex:1}}>{it.name} — {it.category||'—'} — {Number(it.price).toFixed(2)}€{it.note_options ? <div className="muted" style={{fontSize:12}}>Optionen: {it.note_options}</div> : null}</div><div style={{display:'flex',gap:6}}><button className="btn btn-secondary btn-sm" onClick={async()=>{
          const val = prompt('Neuer Preis für '+it.name, String(it.price))
          if (val===null) return
          const price = parseFloat(String(val).replace(',','.'))
          if (isNaN(price)) { alert('Ungültiger Preis'); return }
          await fetch('/api/admin/items/'+it.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ category_id: it.category_id || null, name: it.name, price, available: it.available?1:0, note_options: it.note_options || null }) })
          load(); onRefreshMenu && onRefreshMenu()
        }}>Preis ändern</button><button className="btn btn-secondary btn-sm" onClick={()=>setEditingItemOptions({id: it.id, name: it.name, note_options: it.note_options || '', category_id: it.category_id, price: it.price, available: it.available})}>Optionen</button><button className="btn btn-danger btn-sm" onClick={() => delItem(it.id)}>Löschen</button></div></li>)}</ul>
        <div className="form-row" style={{flexWrap:'wrap'}}>
          <input placeholder="Name" value={newItem.name} onChange={e=>setNewItem(s=>({...s,name:e.target.value}))} />
          <select value={newItem.category_id} onChange={e=>setNewItem(s=>({...s,category_id:e.target.value}))}>
            <option value="">(keine Kategorie)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Preis" value={newItem.price} onChange={e=>setNewItem(s=>({...s,price:e.target.value.replace(',','.')}))} />
          <input placeholder="Optionen (z.B. Ketchup,Mayo)" value={newItem.note_options} onChange={e=>setNewItem(s=>({...s,note_options:e.target.value}))} style={{minWidth:200}} />
          <button className="btn btn-primary" onClick={addItem}>Produkt hinzufügen</button>
        </div>
      </div>

      <div className="panel">
        <h3>Tische</h3>
        <ul>{tables.map(t => <li key={t.id}><div style={{flex:1}}>{t.number}</div><button className="btn btn-danger btn-sm" onClick={() => delTable(t.id)}>Löschen</button></li>)}</ul>
        <div className="form-row">
          <input placeholder="Tischnummer oder Bereich (z.B. 1-30)" value={newTable} onChange={e=>setNewTable(e.target.value)} />
          <button className="btn btn-primary" onClick={addTable}>Tische hinzufügen</button>
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
      {editingItemOptions && (
        <EditItemOptionsModal
          item={editingItemOptions}
          onClose={() => setEditingItemOptions(null)}
          onSave={async (noteOptions) => {
            await fetch('/api/admin/items/'+editingItemOptions.id, {
              method: 'PUT',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({
                category_id: editingItemOptions.category_id || null,
                name: editingItemOptions.name,
                price: editingItemOptions.price,
                available: editingItemOptions.available ? 1 : 0,
                note_options: noteOptions || null
              })
            })
            setEditingItemOptions(null)
            load()
            onRefreshMenu && onRefreshMenu()
          }}
        />
      )}
      {showImport && (
        <ImportProductsModal 
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            load()
            onRefreshMenu && onRefreshMenu()
          }}
        />
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

function EditItemOptionsModal({ item, onClose, onSave }) {
  const [noteOptions, setNoteOptions] = useState(item.note_options || '')
  
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Notiz-Optionen für {item.name}</h3>
        <div>
          <label>Optionen (komma-getrennt)</label>
          <input
            type="text"
            value={noteOptions}
            onChange={e => setNoteOptions(e.target.value)}
            placeholder="z.B. Ketchup,Mayo,ohne Zwiebeln"
            autoFocus
          />
          <div className="muted" style={{fontSize:12, marginTop:4}}>
            Diese Optionen erscheinen als Buttons beim Hinzufügen von Notizen zu diesem Artikel.
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => onSave(noteOptions)}>Speichern</button>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}
function ImportProductsModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleFileSelect(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError(null)
    
    // Quick validation
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls') && !f.name.endsWith('.csv')) {
      setError('Nur Excel (.xlsx, .xls) oder CSV-Dateien erlaubt')
      setFile(null)
      return
    }
    
    if (f.size > 10 * 1024 * 1024) {
      setError('Datei ist zu groß (max. 10MB)')
      setFile(null)
      return
    }
    
    setPreview(`${f.name} (${(f.size / 1024).toFixed(0)} KB)`)
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const res = await fetch('/api/admin/import-products', {
        method: 'POST',
        body: formData
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Import fehlgeschlagen')
        return
      }
      
      // Show summary
      let message = `Import erfolgreich! ${data.success} Produkte hinzugefügt/aktualisiert.`
      if (data.errors && data.errors.length > 0) {
        message += `\n\nWarnungen (${data.errors.length}):`
        data.errors.slice(0, 10).forEach(err => {
          message += `\n- Zeile ${err.line}: ${err.error}`
        })
        if (data.errors.length > 10) {
          message += `\n... und ${data.errors.length - 10} weitere`
        }
      }
      alert(message)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{minWidth: 400}} onClick={e => e.stopPropagation()}>
        <h3>Preisliste importieren</h3>
        
        <div style={{padding: '16px', backgroundColor: '#f5f5f5', borderRadius: 4, marginBottom: 16}}>
          <div className="muted" style={{fontSize: 12, marginBottom: 8}}>
            Excel-Datei mit Spalten: <strong>Produktname, Kategorie, Preis, Optionen</strong>
          </div>
          <div className="muted" style={{fontSize: 11}}>
            Bestehende Produkte mit gleichem Namen + Kategorie werden aktualisiert.
          </div>
        </div>
        
        {error && (
          <div style={{padding: 12, backgroundColor: '#fee', borderRadius: 4, marginBottom: 16, color: '#b00', fontSize: 14}}>
            {error}
          </div>
        )}
        
        <div style={{marginBottom: 16}}>
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            disabled={loading}
          />
          {preview && (
            <div className="muted" style={{fontSize: 12, marginTop: 8}}>✓ {preview}</div>
          )}
        </div>
        
        <div className="actions">
          <button 
            className="btn btn-primary" 
            onClick={handleImport}
            disabled={!file || loading}
          >
            {loading ? 'Wird importiert...' : 'Importieren'}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}