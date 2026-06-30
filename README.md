# RIKER – Registrierkassen-Interface für Karnevalssitzungen mit Echtzeit-Rückmeldungen

Eine schlanke Web‑Kasse für Sitzungen: Bestellungen aufnehmen, Küche koordinieren, selektiv bezahlen und Tages‑Reports — alles im Browser, optimiert für Touch.

## 🎯 Features

### Bestellen (mobil‑freundlich)
- Direkte Tischauswahl: Tisch-Raster wird sofort angezeigt, ein Tipp wählt den Tisch und öffnet die Bestellansicht (kein zusätzlicher „Tisch wählen"-Schritt). Aktiver Tisch wird als Chip mit „Ändern" angezeigt
- Kellnername optional erfassbar
- Artikel nach Kategorien gruppiert, Menge und Notizen (Sonderwünsche)
- Pro Artikel konfigurierbare Button-Farbe (im Admin) mit automatisch lesbarer Textfarbe
- Vordefinierte Notizoptionen pro Artikel (z. B. „Ketchup, Mayo" für Pommes)
- „Bestellung abschicken“: legt Order an, erzeugt Bon‑Datei und leert Tisch/Warenkorb

### Gäste-Bestellung (experimentell)
- Gäste öffnen `/<Tischnummer>` (z. B. `/5`) und gelangen zu einer kundenoptimierten Bestellansicht
- Namenseingabe erforderlich; Bestellungen werden auf dem Bon ausdrücklich als „GAST <Name>" ausgewiesen
- Im Admin-Bereich per Schalter an-/abschaltbar; bei deaktivierter Funktion werden Gast-Bestellungen serverseitig abgelehnt

### Küche
- Übersicht offener Bestellungen mit Auto‑Refresh (3 s)- Artikel nach Kategorien gruppiert für bessere Übersicht- Einzelne Bestellungen als „Erledigt“ markieren

### Service (Bezahlen)
- Alle offenen Positionen eines Tisches — zusammengeführt über alle Bestellungen
- Teilzahlungen: beliebige Einheiten auswählen; serverseitiges korrektes Splitten bei Teilmengen

### Admin
- Dashboard mit Live-Kennzahlen (Umsatz bezahlt/gesamt/offen, offene Bestellungen) und Grafiken: Umsatzverlauf (kumuliert), Bilanz bezahlt vs. offen, Top-Artikel — Auto-Refresh alle 15 s
- Stammdaten: Kategorien, Produkte (inkl. Notizoptionen und Button-Farbe), Tische
- Tische: Einzeln oder als Bereich anlegen (z. B. „1-30")
- Produkte: Excel-Export/Import für schnelle Bulk-Bearbeitung
- Preisliste als Word-Dokument (.docx) „Speisen und Getränke" mit Bildmarke als Hintergrund herunterladen
- Gäste-Bestellung (experimentell) per Schalter aktivieren/deaktivieren
- Reports (Tagesumsatz bezahlt, Bestellungen, verkaufte Artikel) zusätzlich in separatem Fenster
- „Kasse auf Null setzen“: löscht Bestellungen und lokale Bon‑Dateien (irreversibel)
- Passwortschutz: Admin-Bereich erfordert Anmeldung per `ADMIN_PASSWORD`

### Drucken
- Text‑Bons unter `prints/` mit Schema `order-<id>-<timestamp>.txt`
- Support für Client-Software die einen Bon-Druck realisiert

### Echtzeit
- Polling für Küchenansicht (3 s); keine externen Realtime‑Dienste notwendig

## 🗄️ Datenhaltung
- Persistenz über SQLite: `data/db.sqlite` (wird bei Start/Seed erstellt)
- DB‑Schema: `server/schema.sql` (Migrationen minimal gehalten)
- Bon‑Ablage: `prints/` (Dateien werden neu angelegt, nicht überschrieben)
- Docker: Named Volumes `riker-data` und `riker-prints` (persistent, portabel)

## 🚀 Installation & Betrieb

### Docker (empfohlen)

Mit Compose (nutzt Named Volumes für persistente Daten):
```powershell
docker compose up -d --build
```

Anwendung öffnen: http://localhost:3000

Optional Admin-Passwort setzen (empfohlen):
```powershell
$env:ADMIN_PASSWORD="dein-sicheres-passwort"
docker compose up -d --build
```

Optionale Initialdaten (Beispielmenü/Tische):
```powershell
# im laufenden Container
docker exec -it riker node scripts/init_db.js
```

**Backup & Restore (Named Volumes):**
```powershell
# Backup erstellen
docker run --rm -v riker-data:/data -v ${PWD}:/backup alpine tar czf /backup/riker-data-backup.tar.gz -C /data .
docker run --rm -v riker-prints:/prints -v ${PWD}:/backup alpine tar czf /backup/riker-prints-backup.tar.gz -C /prints .

# Restore
docker run --rm -v riker-data:/data -v ${PWD}:/backup alpine tar xzf /backup/riker-data-backup.tar.gz -C /data
docker run --rm -v riker-prints:/prints -v ${PWD}:/backup alpine tar xzf /backup/riker-prints-backup.tar.gz -C /prints
```

### Lokale Entwicklung (ohne Docker)

Server starten:
```powershell
cd server
npm install
$env:ADMIN_PASSWORD="dein-sicheres-passwort"
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
1) Tisch direkt im angezeigten Raster antippen (kein separater „Tisch wählen"-Schritt). Über „Ändern" zurück zum Raster; bei gefülltem Warenkorb erscheint beim Wechsel eine Bestätigung.
2) Optional: Kellnername eingeben (wird auf Bon gedruckt).
3) Artikel auswählen, Menge/Notizen setzen, in den Warenkorb legen.
   - Für Artikel mit vordefinierten Optionen (z. B. „Ketchup, Mayo" bei Pommes) können diese per Klick ausgewählt werden.
4) Bestellung abschicken → Bon‑Datei wird erzeugt, Küche sieht den Auftrag.
5) In „Küche" Bestellungen bearbeiten/abschließen.
6) In „Service" offene Einheiten auswählen und bezahlen (Teilzahlung möglich).
7) In „Admin" Stammdaten pflegen, Produkte per Excel importieren/exportieren und Tages‑Reports öffnen.

## 🏗️ Architektur

### Backend (Node.js/Express + SQLite)
- Express 4, `sqlite3`/`sqlite`
- Statisches Ausliefern des gebauten Frontends
- Endpunkte für Menü, Orders, Tabellen‑Aggregation, Admin und Reports

### Frontend (React + Vite)
- React 18, Vite Build
- Mobile‑first UI, einfache Styles

### API‑Endpunkte (Auswahl)

#### Menü & Bestellungen
- GET `/api/menu` — Kategorien mit Items (inkl. `noteOptions` und `color` pro Artikel)
- POST `/api/orders` — `{ tableNumber, waiter, items:[{id, qty, notes}] }`
  - Gast-Bestellung: zusätzlich `{ guest: true, customerName }` — nur erlaubt, wenn Gäste-Bestellung aktiviert ist; Bon weist „GAST <Name>" aus
- GET `/api/orders?status=open|paid|complete` — Bestellungen filtern nach Status
- POST `/api/orders/:id/pay` — Bestellung als bezahlt markieren
- POST `/api/orders/:id/complete` — Bestellung als erledigt markieren

#### Tisch-Service (Bezahlen)
- GET `/api/tables` — verfügbare Tische (öffentlich)
- GET `/api/settings` — öffentliche Feature-Flags, z. B. `{ guestOrderingEnabled }`
- GET `/api/tables/:number/items` — offene Einheiten eines Tisches (qty expandiert)
- POST `/api/tables/:number/pay-items` — `{ itemIds:["<order_item_id>-<index>", ...] }`

#### Authentifizierung (nur Admin)
- POST `/api/auth/login` — `{ password }` setzt Admin-Session
- POST `/api/auth/logout` — Admin-Session beenden
- GET `/api/auth/status` — `{ authenticated: boolean }`
- POST `/api/auth/change-password` — `{ currentPassword, newPassword }` Passwort ändern

#### Admin Stammdaten
- GET/POST/PUT/DELETE `/api/admin/categories` — Kategorien verwalten
- GET/POST/PUT/DELETE `/api/admin/items` — Produkte verwalten (inkl. `note_options`)
- GET/POST/PUT/DELETE `/api/admin/tables` — Tische verwalten
  - POST mit `range: "1-30"` legt mehrere Tische auf einmal an

#### Admin Export/Import
- GET `/api/admin/export-products?mode=template|current` — Excel als Vorlage oder mit aktuellen Produkten herunterladen
- GET `/api/admin/export-template` — Legacy-Endpunkt für Vorlagen-Download
- GET `/api/admin/export-pricelist` — Preisliste „Speisen und Getränke" als Word (.docx) mit Bildmarke als Hintergrund
- POST `/api/admin/import-products` — Excel hochladen (multipart/form-data, field: `file`)

#### Admin Reports & Einstellungen
- GET `/api/admin/reports/summary?date=YYYY-MM-DD` — Tagesumsatz (nur bezahlte Items)
- GET `/api/admin/reports/summary-all?date=YYYY-MM-DD` — Gesamt-Umsatz (inkl. unbezahlt)
- GET `/api/admin/reports/orders?date=YYYY-MM-DD` — Bestellungen für einen Tag
- GET `/api/admin/reports/items?date=YYYY-MM-DD` — Verkaufte Artikel (gesamt + bezahlt)
- GET `/api/admin/reports/timeseries?bucket=<min>` — Umsatzverlauf (Zeitreihe, kumuliert) für die Dashboard-Grafiken
- GET/POST `/api/admin/settings` — Feature-Flags lesen/setzen, z. B. `{ guestOrderingEnabled: boolean }`
- POST `/api/admin/reset` — Kasse auf Null (löscht alle Bestellungen + Bons)

## 🎨 Design
- Modernes, dunkles Layout mit dezenten Farbverläufen (statt steriler Flächen)
- Admin-Dashboard mit Kennzahl-Karten und Grafiken (recharts)
- Touch‑optimierte Controls; pro Artikel einstellbare Button-Farben
- Fokus auf schnelle, robuste Eingaben vor Ort

## 📝 Changelog (Kurz)
- 2025‑11: Docker Compose hinzugefügt; Tischwechsel‑Hinweis bereinigt (statt statisch → kontextuelle Bestätigung)
- 2026‑02: Kellnernamen auf Bons; Notizoptionen für Artikel; Kategorien-Gruppierung in Menü/Küche; Excel-Import/Export für Produkte; Tisch-Bereichsanlage (z. B. „1-30")
- 2026‑06: Admin-Dashboard mit Grafiken; pro-Artikel Button-Farben; direkte Tischauswahl; .docx-Preisliste „Speisen und Getränke" mit Bildmarke; experimentelle Gäste-Bestellung über `/<Tischnummer>`


