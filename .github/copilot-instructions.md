## Ziel
Diese Datei gibt KI-Coding-Agenten präzise, umsetzbare Hinweise, um in diesem Repository ein einfaches Bestell- und Abrechnungssystem (POS) zu implementieren, zu bauen und lokal in Docker auszuführen.

## Kurze Architektur (Big picture)
- Zwei Hauptkomponenten: `server/` (REST-API, DB, Druck-Queue) und `client/` (mobile-first Web-UI).
- Persistenz: leichte eingebettete DB (SQLite) unter `data/db.sqlite`.
- Kommunikation: HTTP REST für CRUD + optional WebSocket für Echtzeit-Updates an Küche/Service.
- Deployment: alles in einem Docker-Container / Docker Compose für lokale Entwicklung.

## Wichtige Dateien/Orte (Erwartet oder anzulegen)
- `server/` - Backend-API (z. B. Node/Express oder Python/Flask). Beispiel-entries: `server/index.js`, `server/Dockerfile`.
- `client/` - Frontend (z. B. React mit Vite). Beispiel: `client/src/App.tsx`, `client/Dockerfile`.
- `docker-compose.yml` oder `Dockerfile` im Repo-Root zum lokalen Start.
- `data/db.sqlite` - die SQLite-Datei (wird von Docker-Container erzeugt oder gemountet).
- `prints/` - Ordner, in dem Bons als PDF/Plaintext geschrieben werden (simulierter Druck).

## Developer-Workflows & Befehle (Windows PowerShell)
- Lokales Build & Start (mit Docker Compose):
```powershell
docker compose up --build
```
- Einzelnes Image bauen (Root):
```powershell
docker build -t kassensystem:local .
docker run --rm -p 3000:3000 -p 8000:8000 -v ${PWD}:/app/data kassensystem:local
```
- DB initialisieren (falls nötig): `node server/scripts/init_db.js` oder `python server/init_db.py` (je nach Stack).

## API-Vertrag (konkrete Endpunkte, die Implementationen erwarten sollten)
- GET /api/menu -> Liste von Kategorien und Items (id,name,price,available)
- POST /api/orders -> { tableNumber, items:[{id,qty,notes}], total }
- GET /api/orders[?status=] -> aktuelle Tickets für Service/Küche
- POST /api/orders/:id/pay -> markiert Bestellung als bezahlt
- POST /api/orders/:id/complete -> Küche markiert Ticket als erledigt

## UI-Verhalten / UX-Hinweise
- Mobile-first: nach Auswahl der Tischnummer (`/table/:id`) wird ein Grid mit Kategorien/Items angezeigt.
- Tap auf Item fügt Position zur aktuellen Bestellung hinzu; per-item `notes` für Sonderwünsche möglich.
- Button "Bestellung abschicken" speichert die Bestellung und erzeugt einen Bon (in `prints/`).
- Button "Bezahlen" steht für Service-Personal zur Verfügung (API call: `/api/orders/:id/pay`).

## Drucker / Bons
- Für erste Iteration: generiere Bons als Text- oder PDF-Dateien in `prints/` statt echte Drucker-API.
- Kennzeichne Dateinamen mit `order-{id}-{ts}.txt`.

## Projekt-spezifische Konventionen / Hinweise für den Agenten
- Repository aktuell leer: erzeuge klar strukturierte `server/` und `client/`-Ordner.
- Bevorzuge SQLite (kein externes DB-Setup). Lege DB-Schema in `server/migrations/` oder `server/schema.sql` ab.
- Halte API-Spezifikation eng an obigen Endpunkten, damit Frontend und Backend leicht gekoppelt werden können.
- Simuliere Druck und Warteschlangen lokal (Date writes + in-memory queues) bevor externe Services angebunden werden.

## Tests & Validierung
- Implementiere einfache automatisierte Rauchtests: `server/tests/api-smoke.test.js` und `client/tests/ui-smoke.test.js`.
- CI ist optional; lokal reicht `docker compose up --build` und ein kurzer Postman/curl-Check der Endpunkte.

## Fragen an den Maintainer
- Bevorzugter Tech-Stack (Node/Express + React empfohlen) — soll ich das vorgeben oder freistellen?
- Gibt es einen echten Bondrucker oder reicht die Datei-Simulation für den Anfang?

Bitte Rückmeldung, ob ich dieses Ziel so implementieren soll; ich kann danach die Verzeichnisstruktur, Beispiel-Implementierung und Docker-Konfiguration erzeugen.
