# RIKER – Registrierkassen‑Interface für Karnevalssitzungen

Eine schlanke Web‑Kasse für Sitzungen: Bestellungen aufnehmen, Küche koordinieren, selektiv bezahlen und Tages‑Reports — alles im Browser, optimiert für Touch.

## 🎯 Features

### Bestellen (mobil‑freundlich)
- Tischauswahl mit Bestätigung, falls beim Wechsel ein gefüllter Warenkorb existiert
- Artikel nach Kategorien, Menge und Notizen (Sonderwünsche)
- „Bestellung abschicken“: legt Order an, erzeugt Bon‑Datei und leert Tisch/Warenkorb

### Küche
- Übersicht offener Bestellungen mit Auto‑Refresh (3 s)
- Einzelne Bestellungen als „Erledigt“ markieren

### Service (Bezahlen)
- Alle offenen Positionen eines Tisches — zusammengeführt über alle Bestellungen
- Teilzahlungen: beliebige Einheiten auswählen; serverseitiges korrektes Splitten bei Teilmengen

### Admin
- Stammdaten: Kategorien, Produkte, Tische
- Reports (Tagesumsatz bezahlt, Bestellungen, verkaufte Artikel) in separatem Fenster
- „Kasse auf Null setzen“: löscht Bestellungen und lokale Bon‑Dateien (irreversibel)

### Drucken
- Text‑Bons unter `prints/` mit Schema `order-<id>-<timestamp>.txt`

### Echtzeit
- Polling für Küchenansicht (3 s); keine externen Realtime‑Dienste notwendig

## 🗄️ Datenhaltung
- Persistenz über SQLite: `data/db.sqlite` (wird bei Start/Seed erstellt)
- DB‑Schema: `server/schema.sql` (Migrationen minimal gehalten)
- Bon‑Ablage: `prints/` (Dateien werden neu angelegt, nicht überschrieben)

## 🚀 Installation & Betrieb

### Docker (empfohlen)

Mit Compose (inkl. Volumes und Healthcheck):
```powershell
docker compose up -d --build
```

Alternativ Einzel‑Container:
```powershell
docker build -t riker:local .
docker run --name riker_local --rm -d -p 3000:3000 -v ${PWD}/data:/app/data -v ${PWD}/prints:/app/prints riker:local
```

Anwendung öffnen: http://localhost:3000

Optionale Initialdaten (Beispielmenü/Tische):
```powershell
# lokal (ohne Container)
node server/scripts/init_db.js

# oder im laufenden Container
docker exec -it riker node scripts/init_db.js
```

### Lokale Entwicklung (ohne Docker)

Server starten:
```powershell
cd server
npm install
npm run start
# http://localhost:3000
```

Client (Vite Dev‑Server):
```powershell
cd client
npm install
npm run dev
# http://localhost:5173
```

Hinweis: Im Container liefert Express das gebaute Frontend aus `server/public` aus. Im lokalen Dev nutzt der Client die API unter http://localhost:3000.

## 📱 Verwendung
1) Tisch wählen (oder anpassen). Bei gefülltem Warenkorb erscheint beim Wechsel eine Bestätigung.
2) Artikel auswählen, Menge/Notizen setzen, in den Warenkorb legen.
3) Bestellung abschicken → Bon‑Datei wird erzeugt, Küche sieht den Auftrag.
4) In „Küche“ Bestellungen bearbeiten/abschließen.
5) In „Service“ offene Einheiten auswählen und bezahlen (Teilzahlung möglich).
6) In „Admin“ Stammdaten pflegen und Tages‑Reports öffnen.

## 🏗️ Architektur

### Backend (Node.js/Express + SQLite)
- Express 4, `sqlite3`/`sqlite`
- Statisches Ausliefern des gebauten Frontends
- Endpunkte für Menü, Orders, Tabellen‑Aggregation, Admin und Reports

### Frontend (React + Vite)
- React 18, Vite Build
- Mobile‑first UI, einfache Styles

### API‑Endpunkte (Auswahl)
- GET `/api/menu` — Kategorien mit Items
- POST `/api/orders` — `{ tableNumber, items:[{id,qty,notes}] }`
- GET `/api/orders?status=open|paid|complete`
- POST `/api/orders/:id/pay` — Bestellung als bezahlt markieren
- POST `/api/orders/:id/complete` — Bestellung als erledigt markieren
- GET `/api/tables/:number/items` — offene Einheiten eines Tisches (qty expandiert)
- POST `/api/tables/:number/pay-items` — `{ itemIds:["<order_item_id>-<index>", ...] }`
- Admin Stammdaten: `GET/POST/PUT/DELETE /api/admin/{categories|items|tables}`
- Reports: `/api/admin/reports/{summary|orders|items}` mit optional `?date=YYYY-MM-DD`
- Reset: POST `/api/admin/reset`

## 🎨 Design
- Schlichtes, gut lesbares Layout
- Touch‑optimierte Controls
- Fokus auf schnelle, robuste Eingaben vor Ort

## 📝 Changelog (Kurz)
- 2025‑11: Docker Compose hinzugefügt; Tischwechsel‑Hinweis bereinigt (statt statisch → kontextuelle Bestätigung)

## 📄 Lizenz
MIT — siehe `server/package.json`

