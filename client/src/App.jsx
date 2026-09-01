import React, { useEffect, useState } from 'react'
import logo from './bildmarke.png'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from 'recharts'

// Choose readable text color (black/white) for a given hex background
function pickTextColor(hex) {
  if (!hex || typeof hex !== 'string') return '#ffffff'
  const m = hex.replace('#', '')
  if (m.length !== 6 && m.length !== 3) return '#ffffff'
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // Relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0b0f14' : '#ffffff'
}

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

function LoginDialog({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login fehlgeschlagen')
        setPassword('')
      } else {
        onSuccess?.()
      }
    } catch {
      setError('Login fehlgeschlagen')
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-dialog-overlay">
      <div className="login-dialog">
        <h2>Anmeldung erforderlich</h2>
        <p>Bitte geben Sie das Passwort ein, um fortzufahren.</p>

        <form onSubmit={handleSubmit}>
          <div className="login-form-group">
            <label htmlFor="password">Passwort:</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={loading}
              placeholder="Passwort eingeben"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading || !password}>
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Always-visible touch grid: one tap selects a table (no extra "Tisch wählen" step)
function InlineTableGrid({ tables, value, onSelect, title = 'Tisch wählen', subtitle = 'Tippe auf einen Tisch, um direkt zu bestellen.' }) {
  const [page, setPage] = useState(0)
  const pageSize = 40
  const sorted = [...tables].sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0))
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const slice = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize)

  return (
    <div className="panel">
      <h2 style={{ marginBottom: 4 }}>{title}</h2>
      <div className="muted" style={{ marginBottom: 12 }}>{subtitle}</div>
      {tables.length === 0 ? (
        <div className="muted">Keine Tische angelegt.</div>
      ) : (
        <>
          <div className="table-grid">
            {slice.map(t => (
              <button
                key={t.id}
                className={`table-btn ${String(value) === String(t.number) ? 'active' : ''}`}
                onClick={() => onSelect(t.number)}
              >
                <div className="num">{t.number}</div>
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pager">
              <button className="btn btn-ghost btn-sm" disabled={currentPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Zurück</button>
              <span className="muted">Seite {currentPage + 1} / {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={currentPage === totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>Weiter</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Compact header chip showing the active table with a quick "Ändern" action
function TableHeaderChip({ value, onChange }) {
  return (
    <div className="table-chip">
      <div className="table-chip-info">
        <span className="muted">Aktueller Tisch</span>
        <strong className="table-chip-num">Tisch {value}</strong>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Ändern</button>
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
            {cat.items.map(it => {
              const colorStyle = it.color
                ? { width: '100%', background: it.color, color: pickTextColor(it.color), borderColor: 'transparent' }
                : { width: '100%' }
              return (
                <button
                  key={it.id}
                  className="item"
                  onClick={() => onAddItem(it)}
                  style={colorStyle}
                >
                  <div>{it.name}</div>
                  <small style={it.color ? { color: pickTextColor(it.color), opacity: 0.85 } : undefined}>{it.price.toFixed(2)}€</small>
                </button>
              )
            })}
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
  // Lightweight path routing: /<Tischnummer> opens the guest self-order view.
  const guestMatch = (typeof window !== 'undefined' ? window.location.pathname : '/').match(/^\/(\d+)\/?$/)
  if (guestMatch) {
    return <GuestOrder tableNumber={guestMatch[1]} />
  }
  return <StaffApp />
}

function StaffApp() {
  const [waiter, setWaiter] = useState(null)
  const [showWaiterModal, setShowWaiterModal] = useState(false)
  const [table, setTable] = useState('')
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [editingItem, setEditingItem] = useState(null) // {index, notes} or {newItem, notes} for editing notes
  const [view, setView] = useState('order')
  const [tables, setTables] = useState([])
  const [navOpen, setNavOpen] = useState(false)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)

  useEffect(() => {
    // Load waiter from localStorage
    const savedWaiter = localStorage.getItem('waiter')
    if (savedWaiter) {
      setWaiter(savedWaiter)
    } else {
      setShowWaiterModal(true)
    }

    fetch('api/menu').then(r => r.json()).then(setMenu)
    fetch('api/tables').then(r=>r.json()).then(ts => setTables(ts))
    fetch('api/auth/status').then(r => r.json()).then(data => setAdminAuthenticated(!!data.authenticated)).catch(() => setAdminAuthenticated(false))
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
    const res = await fetch('api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
                <span className="muted" style={{ fontSize: 12 }}>Bedienung:</span>
                <strong>{waiter}</strong>
                <button className="btn btn-ghost btn-sm" onClick={changeWaiter} title="Namen ändern">✏️</button>
              </div>
            )}
            <button
              className="btn btn-ghost btn-sm hamburger"
              aria-label="Menü"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(o => !o)}
            >
              <i className={`fa-solid ${navOpen ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true" />
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
            {table ? (
              <div>
                <TableHeaderChip value={table} onChange={changeTable} />
                <div className="layout">
                  <MenuGrid menu={menu} onAddItem={addItem} />
                  <Cart items={cart} onRemove={removeItem} onEditNotes={startEditNotes} onSubmit={submitOrder} table={table} />
                </div>
              </div>
            ) : (
              <InlineTableGrid tables={tables} value={table} onSelect={changeTable} />
            )}
          </div>
        )}

        {view === 'kitchen' && <Kitchen />}
        {view === 'service' && <Service />}
        {view === 'admin' && (adminAuthenticated
          ? <Admin onRefreshMenu={() => fetch('api/menu').then(r=>r.json()).then(setMenu)} />
          : <LoginDialog onSuccess={() => setAdminAuthenticated(true)} />)}
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
        const os = await (await fetch('api/orders?status=open')).json()
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
      {orders.map(o => {
        // Group items by category
        const grouped = {}
        if (o.items && Array.isArray(o.items)) {
          o.items.forEach(it => {
            const catName = it.category || '— Sonstige —'
            if (!grouped[catName]) grouped[catName] = []
            grouped[catName].push(it)
          })
        }
        const categories = Object.entries(grouped)
        return (
          <div key={o.id} className="ticket">
            <div>Bestellung #{o.id} — {o.waiter ? `Bedienung: ${o.waiter} — ` : ''}Tisch {o.table_number} — {o.total.toFixed(2)}€</div>
            {categories.map(([catName, catItems]) => (
              <div key={catName} style={{marginBottom: 12}}>
                <div style={{fontWeight: 600, fontSize: 12, color: '#666', marginBottom: 6}}>{catName}</div>
                <ul>
                  {catItems && catItems.map(it => (
                    <li key={it.id}>
                      {it.qty}× {it.name} {it.notes ? <small>({it.notes})</small> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <button className="btn btn-success" onClick={() => markDone(o.id)}>Erledigt</button>
          </div>
        )
      })}
    </div>
  )
}

function Service() {
  const [tables, setTables] = useState([])
  const [table, setTable] = useState('')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    fetch('api/tables').then(r=>r.json()).then(setTables)
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

  if (!table) {
    return (
      <InlineTableGrid
        tables={tables}
        value={table}
        onSelect={setTable}
        title="Bezahlen — Tisch wählen"
        subtitle="Tippe auf einen Tisch, um offene Posten zu sehen."
      />
    )
  }

  return (
    <div>
      <TableHeaderChip value={table} onChange={setTable} />
      <div className="panel">
        <h2>Bezahlen — Tisch bezahlen</h2>
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
    </div>
  )
}

function StatCard({ label, value, accent, sub }) {
  return (
    <div className="stat-card" style={accent ? { borderTopColor: accent } : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub ? <div className="stat-sub muted">{sub}</div> : null}
    </div>
  )
}

function AdminDashboard() {
  const [summary, setSummary] = useState({ paid: 0, all: 0 })
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [series, setSeries] = useState([])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const [s, sa, ord, it, ts] = await Promise.all([
          fetch('api/admin/reports/summary').then(r => r.json()),
          fetch('api/admin/reports/summary-all').then(r => r.json()),
          fetch('api/admin/reports/orders').then(r => r.json()),
          fetch('api/admin/reports/items').then(r => r.json()),
          fetch('api/admin/reports/timeseries').then(r => r.json())
        ])
        if (cancelled) return
        setSummary({ paid: s.revenuePaid || 0, all: sa.revenueAll || 0 })
        setOrders(Array.isArray(ord) ? ord : [])
        setItems(Array.isArray(it) ? it : [])
        setSeries(Array.isArray(ts) ? ts : [])
      } catch {}
    }
    tick()
    const id = setInterval(tick, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const fmt = n => (Number(n) || 0).toFixed(2) + '€'
  const openCount = orders.filter(o => o.status === 'open').length
  const openRevenue = Math.max(0, (summary.all || 0) - (summary.paid || 0))
  const topItems = items.slice(0, 8).map(r => ({ name: r.name, Menge: r.soldQty || 0 }))
  const balance = [
    { name: 'Bezahlt', value: Number((summary.paid || 0).toFixed(2)) },
    { name: 'Offen', value: Number(openRevenue.toFixed(2)) }
  ]
  const balanceColors = ['#10b981', '#f59e0b']

  return (
    <div className="panel span-4 dashboard">
      <div className="dashboard-head">
        <h3>Dashboard</h3>
        <span className="muted" style={{ fontSize: 12 }}>Aktualisiert automatisch alle 15 s</span>
      </div>
      <div className="stat-grid">
        <StatCard label="Umsatz (bezahlt)" value={fmt(summary.paid)} accent="#10b981" />
        <StatCard label="Umsatz (gesamt)" value={fmt(summary.all)} accent="#6366f1" sub="inkl. offener Positionen" />
        <StatCard label="Offen (Betrag)" value={fmt(openRevenue)} accent="#f59e0b" />
        <StatCard label="Offene Bestellungen" value={openCount} accent="#ef4444" sub={`${orders.length} gesamt`} />
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Umsatzverlauf (kumuliert)</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gAll" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="time" stroke="#9fb0c2" fontSize={11} />
              <YAxis stroke="#9fb0c2" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#e8eef5' }} formatter={(v) => fmt(v)} />
              <Area type="monotone" dataKey="cumAll" name="Gesamt" stroke="#6366f1" fill="url(#gAll)" strokeWidth={2} />
              <Area type="monotone" dataKey="cumPaid" name="Bezahlt" stroke="#10b981" fill="url(#gPaid)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">Bilanz: bezahlt vs. offen</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={balance} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="#9fb0c2" fontSize={11} />
              <YAxis stroke="#9fb0c2" fontSize={11} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#e8eef5' }} formatter={(v) => fmt(v)} />
              <Bar dataKey="value" name="Betrag" radius={[8, 8, 0, 0]}>
                {balance.map((entry, i) => <Cell key={i} fill={balanceColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card span-full">
          <div className="chart-title">Top-Artikel (verkaufte Menge)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topItems} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="#9fb0c2" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis stroke="#9fb0c2" fontSize={11} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#e8eef5' }} />
              <Bar dataKey="Menge" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function Admin({ onRefreshMenu }) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [tables, setTables] = useState([])
  const [newCat, setNewCat] = useState('')
  const [newItem, setNewItem] = useState({ name: '', category_id: '', price: '', note_options: '', color: '' })
  const [newTable, setNewTable] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [editingItemOptions, setEditingItemOptions] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [guestEnabled, setGuestEnabled] = useState(false)
  const [savingGuest, setSavingGuest] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)

  useEffect(() => { load(); }, [])
  function load() {
    fetch('api/admin/categories').then(r=>r.json()).then(setCategories)
    fetch('api/admin/items').then(r=>r.json()).then(setItems)
    fetch('api/admin/tables').then(r=>r.json()).then(setTables)
    fetch('api/admin/settings').then(r=>r.json()).then(d => setGuestEnabled(!!d.guestOrderingEnabled)).catch(()=>{})
  }

  // PUT an item while preserving fields not being changed (incl. color)
  async function saveItem(it, patch) {
    const body = {
      category_id: it.category_id || null,
      name: it.name,
      price: it.price,
      available: it.available ? 1 : 0,
      note_options: it.note_options || null,
      color: it.color || null,
      ...patch
    }
    await fetch('api/admin/items/'+it.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    load(); onRefreshMenu && onRefreshMenu()
  }

  async function toggleGuest(next) {
    setSavingGuest(true)
    try {
      const res = await fetch('api/admin/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ guestOrderingEnabled: next }) })
      const d = await res.json()
      setGuestEnabled(!!d.guestOrderingEnabled)
    } catch {
      alert('Einstellung konnte nicht gespeichert werden')
    } finally {
      setSavingGuest(false)
    }
  }

  async function downloadPricelist() {
    try {
      const res = await fetch('/api/admin/export-pricelist')
      if (!res.ok) throw new Error('Download fehlgeschlagen')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'speisen-und-getraenke.docx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Fehler beim Download: ' + err.message)
    }
  }

  async function downloadCompleteReport() {
    setReportBusy(true)
    try {
      const res = await fetch('/api/admin/export-report')
      if (!res.ok) throw new Error('Download fehlgeschlagen')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'riker-komplettbericht.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Fehler beim Download: ' + err.message)
    } finally {
      setReportBusy(false)
    }
  }

  async function addCategory() {
    if (!newCat) return alert('Name required')
    await fetch('api/admin/categories', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newCat }) })
    setNewCat('')
    load()
  }

  async function addItem() {
    if (!newItem.name) return alert('Name required')
    await fetch('api/admin/items', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newItem.name, category_id: newItem.category_id || null, price: parseFloat(newItem.price)||0, available: 1, note_options: newItem.note_options || null, color: newItem.color || null }) })
    setNewItem({ name: '', category_id: '', price: '', note_options: '', color: '' })
    load(); onRefreshMenu && onRefreshMenu()
  }

  async function addTable() {
    if (!newTable) return alert('Number or range required')
    
    // Check if input is a range (e.g., "1-30")
    if (newTable.includes('-')) {
      const res = await fetch('api/admin/tables', { 
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
      await fetch('api/admin/tables', { 
        method: 'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ number: newTable }) 
      })
    }
    setNewTable('')
    load()
  }

  async function delItem(id) { if (!confirm('löschen?')) return; await fetch('api/admin/items/'+id, { method: 'DELETE' }); load(); onRefreshMenu && onRefreshMenu() }
  async function delCategory(id) { if (!confirm('löschen?')) return; await fetch('api/admin/categories/'+id, { method: 'DELETE' }); load(); }
  async function delTable(id) { if (!confirm('löschen?')) return; await fetch('api/admin/tables/'+id, { method: 'DELETE' }); load(); }

  async function downloadProducts(mode) {
    try {
      const res = await fetch(`/api/admin/export-products?mode=${encodeURIComponent(mode)}`)
      if (!res.ok) throw new Error('Download fehlgeschlagen')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = mode === 'current' ? 'produkte-export.xlsx' : 'produkte-template.xlsx'
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
      <AdminDashboard />

      <div className="panel span-2">
        <h3>Berichte &amp; Verwaltung</h3>
        <div className="form-row" style={{flexWrap:'wrap'}}>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="btn btn-primary" onClick={downloadCompleteReport} disabled={reportBusy}>
              {reportBusy ? 'Bericht wird erstellt…' : 'Komplettbericht (.pdf) herunterladen'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowPasswordDialog(true)}>Passwort ändern</button>
            <button className="btn btn-danger" onClick={()=>setShowReset(true)}>Kasse auf Null setzen</button>
          </div>
        </div>
      </div>

      <div className="panel span-2 guest-panel">
        <h3>Gäste-Bestellung <span className="badge experimental">experimentell</span></h3>
        <p className="muted" style={{marginTop:0}}>Gäste können über <code>/&lt;Tischnummer&gt;</code> selbst bestellen. Bestellungen werden auf dem Bon als <strong>„GAST &lt;Name&gt;"</strong> ausgewiesen.</p>
        <label className="switch-row">
          <span className="switch">
            <input type="checkbox" checked={guestEnabled} disabled={savingGuest} onChange={e => toggleGuest(e.target.checked)} />
            <span className="slider" />
          </span>
          <span>{guestEnabled ? 'Aktiviert' : 'Deaktiviert'}</span>
        </label>
        {guestEnabled && (
          <div className="muted" style={{fontSize:12, marginTop:10}}>
            Beispiel-Link für Tisch 5: <code>{(typeof window !== 'undefined' ? window.location.origin : '')}/5</code>
          </div>
        )}
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
          <button className="btn btn-secondary" onClick={() => setShowExportDialog(true)}>Export herunterladen</button>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>Preisliste hochladen</button>
          <button className="btn btn-secondary" onClick={downloadPricelist}>Preisliste (.docx) herunterladen</button>
        </div>
        <ul>{items.map(it => <li key={it.id}><div style={{flex:1, display:'flex', alignItems:'center', gap:10}}>
          <span className="color-swatch" style={{ background: it.color || 'transparent', borderStyle: it.color ? 'solid' : 'dashed' }} title={it.color || 'keine Farbe'} />
          <div>{it.name} — {it.category||'—'} — {Number(it.price).toFixed(2)}€{it.note_options ? <div className="muted" style={{fontSize:12}}>Optionen: {it.note_options}</div> : null}</div>
        </div><div style={{display:'flex',gap:6, alignItems:'center', flexWrap:'wrap'}}>
        <label className="color-pick" title="Button-Farbe">
          <input type="color" value={it.color || '#1f2937'} onChange={e=>saveItem(it, { color: e.target.value })} />
        </label>
        {it.color ? <button className="btn btn-ghost btn-sm" title="Farbe entfernen" onClick={()=>saveItem(it, { color: null })}>✕ Farbe</button> : null}
        <button className="btn btn-secondary btn-sm" onClick={async()=>{
          const val = prompt('Neuer Name für '+it.name, String(it.name))
          if (val===null) return
          const name = String(val).trim()
          if (!name) { alert('Ungültiger Name'); return }
          await saveItem(it, { name })
        }}>Name ändern</button><button className="btn btn-secondary btn-sm" onClick={async()=>{
          const val = prompt('Neuer Preis für '+it.name, String(it.price))
          if (val===null) return
          const price = parseFloat(String(val).replace(',','.'))
          if (isNaN(price)) { alert('Ungültiger Preis'); return }
          await saveItem(it, { price })
        }}>Preis ändern</button><button className="btn btn-secondary btn-sm" onClick={()=>setEditingItemOptions({id: it.id, name: it.name, note_options: it.note_options || '', category_id: it.category_id, price: it.price, available: it.available, color: it.color})}>Optionen</button><button className="btn btn-danger btn-sm" onClick={() => delItem(it.id)}>Löschen</button></div></li>)}</ul>
        <div className="form-row" style={{flexWrap:'wrap'}}>
          <input placeholder="Name" value={newItem.name} onChange={e=>setNewItem(s=>({...s,name:e.target.value}))} />
          <select value={newItem.category_id} onChange={e=>setNewItem(s=>({...s,category_id:e.target.value}))}>
            <option value="">(keine Kategorie)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Preis" value={newItem.price} onChange={e=>setNewItem(s=>({...s,price:e.target.value.replace(',','.')}))} />
          <input placeholder="Optionen (z.B. Ketchup,Mayo)" value={newItem.note_options} onChange={e=>setNewItem(s=>({...s,note_options:e.target.value}))} style={{minWidth:200}} />
          <label className="color-pick" title="Button-Farbe (optional)">
            <input type="color" value={newItem.color || '#1f2937'} onChange={e=>setNewItem(s=>({...s,color:e.target.value}))} />
          </label>
          {newItem.color ? <button className="btn btn-ghost btn-sm" onClick={()=>setNewItem(s=>({...s,color:''}))}>✕ Farbe</button> : null}
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
          const res = await fetch('api/admin/reset', { method: 'POST' })
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
            await fetch('api/admin/items/'+editingItemOptions.id, {
              method: 'PUT',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({
                category_id: editingItemOptions.category_id || null,
                name: editingItemOptions.name,
                price: editingItemOptions.price,
                available: editingItemOptions.available ? 1 : 0,
                note_options: noteOptions || null,
                color: editingItemOptions.color || null
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
      {showPasswordDialog && (
        <PasswordChangeDialog onClose={() => setShowPasswordDialog(false)} />
      )}
      {showExportDialog && (
        <ExportProductsDialog
          onClose={() => setShowExportDialog(false)}
          onDownload={async (mode) => {
            await downloadProducts(mode)
            setShowExportDialog(false)
          }}
        />
      )}
    </div>
  )
}

function PasswordChangeDialog({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 4) {
      setError('Neues Passwort muss mindestens 4 Zeichen lang sein')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Neue Passwörter stimmen nicht überein')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Passwort-Änderung fehlgeschlagen')
      } else {
        setSuccess('Passwort erfolgreich geändert')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => onClose(), 1200)
      }
    } catch {
      setError('Passwort-Änderung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Passwort ändern</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-8">
            <div>
              <label htmlFor="currentPassword">Aktuelles Passwort</label>
              <input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={loading} required autoFocus />
            </div>
            <div>
              <label htmlFor="newPassword">Neues Passwort</label>
              <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={loading} required minLength={4} />
            </div>
            <div>
              <label htmlFor="confirmPassword">Neues Passwort bestätigen</label>
              <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} required minLength={4} />
            </div>
          </div>
          {error && <div style={{marginTop:10, color:'#ff6b6b'}}>{error}</div>}
          {success && <div style={{marginTop:10, color:'#81c784'}}>{success}</div>}
          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Abbrechen</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Ändern...' : 'Passwort ändern'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ExportProductsDialog({ onClose, onDownload }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Produkte exportieren</h3>
        <p className="muted">Wähle aus, ob du eine Vorlage oder die aktuell eingestellten Artikel herunterladen möchtest.</p>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => onDownload('template')}>Vorlage herunterladen</button>
          <button className="btn btn-secondary" onClick={() => onDownload('current')}>Aktuelle Artikel exportieren</button>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
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
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.csv')) {
      setError('Nur Excel (.xlsx) oder CSV-Dateien erlaubt')
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
      
      const res = await fetch('api/admin/import-products', {
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
            accept=".xlsx,.csv"
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

// Customer-optimized self-ordering view reached via /<Tischnummer>
function GuestOrder({ tableNumber }) {
  const [enabled, setEnabled] = useState(null) // null = loading
  const [menu, setMenu] = useState([])
  const [name, setName] = useState('')
  const [cart, setCart] = useState([])
  const [editingItem, setEditingItem] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setEnabled(!!d.guestOrderingEnabled)).catch(() => setEnabled(false))
    fetch('/api/menu').then(r => r.json()).then(setMenu).catch(() => setMenu([]))
  }, [])

  function addItem(menuItem) {
    if (menuItem.noteOptions && menuItem.noteOptions.length > 0) {
      const item = { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1, notes: '', noteOptions: menuItem.noteOptions }
      setEditingItem({ newItem: item, notes: '' })
      return
    }
    setCart(c => {
      const idx = c.findIndex(it => it.id === menuItem.id && (it.notes || '') === '')
      if (idx >= 0) return c.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it)
      return [...c, { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1, notes: '', noteOptions: menuItem.noteOptions || [] }]
    })
  }

  function removeItem(idx) { setCart(c => c.filter((_, i) => i !== idx)) }
  function startEditNotes(idx) { setEditingItem({ index: idx, notes: cart[idx].notes || '' }) }

  function saveNotes() {
    if (editingItem === null) return
    if (editingItem.newItem) {
      const itemWithNotes = { ...editingItem.newItem, notes: editingItem.notes }
      setCart(c => {
        const idx = c.findIndex(it => it.id === itemWithNotes.id && (it.notes || '') === (itemWithNotes.notes || ''))
        if (idx >= 0) return c.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it)
        return [...c, itemWithNotes]
      })
    } else {
      setCart(c => c.map((it, i) => i === editingItem.index ? { ...it, notes: editingItem.notes } : it))
    }
    setEditingItem(null)
  }

  async function submit() {
    if (!name.trim() || cart.length === 0) return
    setSubmitting(true)
    try {
      const grouped = []
      for (const i of cart) {
        const k = grouped.findIndex(g => g.id === i.id && (g.notes || '') === (i.notes || ''))
        if (k >= 0) grouped[k].qty += i.qty
        else grouped.push({ id: i.id, qty: i.qty, notes: i.notes })
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber, items: grouped, guest: true, customerName: name.trim() })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Bestellung fehlgeschlagen'); return }
      setDone({ id: data.id, total: data.total })
      setCart([])
    } catch {
      alert('Bestellung fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  const total = cart.reduce((s, it) => s + it.price * it.qty, 0)

  return (
    <div className="app guest-app">
      <header>
        <div className="bar container">
          <div className="logo-section">
            <img src={logo} alt="RIKER Bildmarke" className="logo-image" />
            <div className="logo-text">
              <div className="logo-title">RIKER</div>
              <div className="logo-subtitle"><span>Bestellung für Tisch {tableNumber}</span></div>
            </div>
          </div>
        </div>
      </header>
      <main className="page container">
        {enabled === null && <div className="panel"><div className="muted">Lädt…</div></div>}

        {enabled === false && (
          <div className="panel guest-notice">
            <h2>Bestellung derzeit nicht möglich</h2>
            <div className="muted">Die Gäste-Bestellung ist momentan nicht aktiviert. Bitte wende dich an das Personal.</div>
          </div>
        )}

        {enabled && done && (
          <div className="panel guest-notice">
            <h2>Vielen Dank, {name}! 🎉</h2>
            <div>Deine Bestellung <strong>#{done.id}</strong> für Tisch {tableNumber} wurde aufgenommen.</div>
            <div className="total">Summe: {Number(done.total || 0).toFixed(2)}€</div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => setDone(null)}>Weitere Bestellung aufgeben</button>
          </div>
        )}

        {enabled && !done && (
          <div>
            <div className="panel">
              <label htmlFor="guest-name">Dein Name</label>
              <input
                id="guest-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="z.B. Anna"
                style={{ marginTop: 6 }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Erscheint auf dem Bon als „GAST {name || '…'}".</div>
            </div>
            <div className="layout">
              <MenuGrid menu={menu} onAddItem={addItem} />
              <div className="panel" style={{ minWidth: 280 }}>
                <h2>Deine Bestellung</h2>
                <ul>
                  {cart.map((it, idx) => (
                    <li key={idx}>
                      <div style={{ flex: 1 }}>
                        {it.qty}× {it.name}
                        {it.notes && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{it.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEditNotes(idx)} title="Notizen">✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)}>✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="total">Summe: {total.toFixed(2)}€</div>
                <button className="btn btn-primary btn-block" disabled={cart.length === 0 || !name.trim() || submitting} onClick={submit}>
                  {submitting ? 'Wird gesendet…' : 'Bestellung abschicken'}
                </button>
                {!name.trim() && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Bitte zuerst deinen Namen eingeben.</div>}
              </div>
            </div>
          </div>
        )}
      </main>

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
