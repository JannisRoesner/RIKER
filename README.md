# RIKER (POS)

Ein einfaches, mobiles Kassensystem mit Express/SQLite (Backend) und React/Vite (Frontend). Es eignet sich für Sitzungs-Events: Bestellungen aufnehmen, Küche/Service koordinieren, teilweises Bezahlen pro Tisch und einfache Reports.

– Aktueller Stand (November 2025)
- Docker-Image vorhanden: baut das Frontend und serviert es über den Express-Server.
- Persistenz über SQLite (Datei unter `data/db.sqlite`).
- Bons werden als Textdateien unter `prints/` erzeugt (z. B. `order-<id>-<ts>.txt`).
- Views: Bestellen, Küche, Service (teilweise Zahlung), Admin (Stammdaten + Reports + Reset).


## Architektur
- Backend: Node.js + Express, SQLite (Datei-basierte DB) — Ordner `server/`
- Frontend: React 18 + Vite — Ordner `client/`
- Container: Ein Dockerfile baut das Frontend und startet den Server, der die gebaute App statisch ausliefert.

Verzeichnisstruktur (vereinfacht):
- `server/` — API, DB-Schema, Seeds
- `client/` — React-App (Vite)
- `data/` — SQLite-DB (wird erstellt, wenn nicht vorhanden)
- `prints/` — generierte Bon-Dateien (Text)
- `Dockerfile` — Build/Run im Container


## Funktionsumfang (UI)
Bestellen
- Tischauswahl (mobile-first). Beim Wechsel des Tisches mit gefülltem Warenkorb erscheint eine Bestätigung (statischer Hinweis wurde entfernt).
- Artikel-Auswahl nach Kategorien, Menge und optionalen Notizen.
- „Bestellung abschicken“ legt den Auftrag in der DB an, erzeugt einen Bon in `prints/` und leert Warenkorb und Tischauswahl.

Küche
- Liste offener Bestellungen, Auto-Refresh (3s). Einzelne Tickets können als „Erledigt“ markiert werden.

Service (Bezahlen)
- Tischauswahl; Anzeige aller noch offenen (unbezahlten) Einzelpositionen tischübergreifend über alle Bestellungen.
- Teilzahlung: beliebige Positionen selektieren und bezahlen. Server splittet Positionen bei Teilmengen korrekt auf.

Admin
- Stammdaten pflegen: Kategorien, Produkte, Tische.
- Tages-Reports (Umsatz bezahlt, Bestellungen, verkaufte Artikel) in separatem Fenster.
- „Kasse auf Null setzen“: löscht alle Bestellungen (inkl. Bons) — Vorsicht, irreversibel.


## Schnellstart mit Docker (Windows PowerShell)
Container bauen und starten (mit persistenter DB und Bon-Ablage):

```powershell
# Im Repo-Root ausführen
docker build -t riker:local .
docker run --name riker_local --rm -d -p 3000:3000 -v ${PWD}/data:/app/data -v ${PWD}/prints:/app/prints riker:local
```

Danach im Browser öffnen: http://localhost:3000

Nützliche Kommandos:
```powershell
# Logs ansehen
docker logs -f riker_local

# Container stoppen
docker stop riker_local
```

Optionale Initialdaten (Beispieldaten)
- Entweder im UI unter „Admin“ Kategorien/Produkte/Tische anlegen
- Oder per Script initial befüllen:

```powershell
# außerhalb des Containers (verwendet lokale Node-Installation)
node server/scripts/init_db.js

# ODER im Container ausführen
docker exec -it riker node scripts/init_db.js
```


## Lokale Entwicklung (ohne Docker, optional)
Server starten:
```powershell
cd server
npm install
npm run start
# Server läuft auf http://localhost:3000
```

Client im Dev-Modus starten (Vite):
```powershell
cd client
npm install
npm run dev
# Vite-Dev-Server läuft auf http://localhost:5173 (Proxy/Origin je nach Setup)
```

Hinweis: Im Container-Betrieb wird das gebaute Frontend unter `/app/server/public` ausgeliefert. Im lokalen Dev-Setup ruft das Frontend die API unter http://localhost:3000 auf (ggf. CORS/Proxy beachten).


## API-Überblick (Auswahl)
Bestellen und Status
- GET `/api/menu` — Kategorien mit Items
- POST `/api/orders` — neue Bestellung anlegen: `{ tableNumber, items:[{id,qty,notes}] }`
- GET `/api/orders?status=open|paid|complete` — Bestellungen (inkl. Positionen)
- POST `/api/orders/:id/pay` — Bestellung als bezahlt markieren
- POST `/api/orders/:id/complete` — Küche markiert Bestellung als erledigt

Service (tischübergreifend)
- GET `/api/tables/:number/items` — alle unbezahlten Einzelpositionen eines Tisches (jede Menge als einzelne Zeile)
- POST `/api/tables/:number/pay-items` — `{ itemIds: ["<order_item_id>-<index>", ...] }` markiert ausgewählte Einheiten als bezahlt (inkl. korrektes Splitten)

Admin (Stammdaten & Reports)
- Kategorien: `GET/POST/PUT/DELETE /api/admin/categories[/:id]`
- Produkte: `GET/POST/PUT/DELETE /api/admin/items[/:id]`
- Tische: `GET/POST/PUT/DELETE /api/admin/tables[/:id]`
- Reports (optional mit `?date=YYYY-MM-DD`):
	- GET `/api/admin/reports/summary` — Umsatz (nur bezahlte Positionen)
	- GET `/api/admin/reports/orders` — Bestellungen des Tages
	- GET `/api/admin/reports/items` — verkaufte Artikel des Tages
- Reset: POST `/api/admin/reset` — löscht alle Bestellungen und entfernt Bon-Dateien


## Daten & Druck
- SQLite-Datei: `data/db.sqlite` (wird automatisch erstellt; Schema unter `server/schema.sql`).
- Bons: Plain-Text-Dateien in `prints/` mit Namensschema `order-{id}-{ts}.txt`.


## Bekannte Einschränkungen / Hinweise
- Keine Authentifizierung/Rollen — Admin/Service/Küche im selben UI.
- Polling (3s) statt WebSockets für die Küche.
- Initialdaten: Ohne Seed/Admin-Anlage ist die Speisekarte leer.
- Menüabfrage gruppiert nach Kategorien; Produkte ohne Kategorie erscheinen ggf. nicht in `/api/menu`.
- Fehlerbehandlung minimal (optimiert für lokalen Betrieb/Events).


## Lizenz
MIT (siehe `package.json` im `server/`-Projekt)

