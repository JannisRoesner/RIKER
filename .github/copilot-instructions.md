## Zweck dieser Datei
Leitplanken für KI‑Coding‑Agenten in diesem Repository. Der Projekt-Stack ist bereits umgesetzt (Express/SQLite + React/Vite, Docker). Diese Datei beschreibt, was Agenten tun dürfen (Maintenance/Erweiterungen) und was ausdrücklich zu vermeiden ist (Neu‑Scaffolding, Breaking Changes).

Wenn hier keine KI‑Agenten eingesetzt werden, kann diese Datei gefahrlos entfernt werden.

## Projektstand (Kurzüberblick)
- Backend: `server/` (Node/Express, SQLite). Startet auf Port 3000 und liefert das gebaute Frontend aus `server/public` aus.
- Frontend: `client/` (React + Vite). Build wird im Container erzeugt und landet unter `server/public`.
- Daten: SQLite unter `data/db.sqlite` (wird automatisch erstellt); Named Volume `riker-data`.
- Druck: Text-Bons in `prints/` mit Schema `order-<id>-<ts>.txt`; Named Volume `riker-prints`.
- Container: Ein `Dockerfile` baut Frontend und startet den Server. Named Volumes für persistente Daten.

Siehe detaillierte Nutzung in `README.md`.

## Do / Don’t für Agenten
Do (erlaubt)
- Fehlerbehebungen, kleine UX‑Verbesserungen, Performance‑Verbesserungen ohne Breaking Changes.
- Erweiterungen innerhalb bestehender API: neue optionale Parameter/Endpunkte, die Abwärtskompatibilität wahren.
- Reports, kleine Admin‑Funktionen, Validierungen, bessere Fehlermeldungen.
- Sicherheitsfixes (Input-Validierung, robuste DB‑Zugriffe), ohne das Projekt umzubauen.

Don’t (vermeiden)
- Kein Neu‑Scaffolding der Ordnerstruktur oder Framework‑Wechsel.
- Keine Umbenennung bestehender Endpunkte/Contracts ohne Rücksprache.
- Keine Entfernung der bestehenden Tischwechsel‑Bestätigungslogik; kein statischer Hinweis „Tischwechsel leert den Warenkorb“.
- Keine externen Dienste (DB/Queues) anbinden, solange nicht explizit gewünscht.

## Qualitätskriterien
- Build bleibt grün: Container lässt sich bauen und startet; `/api/menu` liefert 200.
- Lint/Typfehler vermeiden (Projekt ist JS/React; keep it simple).
- Bei API‑Änderungen: mindestens ein kurzer Smoke‑Test (lokal) und README‑Erweiterung.

## Entwicklungs‑Hinweise (Kurzform)
- Docker Compose (empfohlen, nutzt Named Volumes):
  ```powershell
  docker compose up -d --build
  ```
- Optionales Seeding:
  ```powershell
  docker exec -it riker node scripts/init_db.js
  ```

## Akzeptanzkriterien für typische Aufgaben
- „Feature X in Admin hinzufügen“: UI‑Button/Flow vorhanden, API‑Route dokumentiert, Fehlpfade abgefangen, Build/Run getestet.
- „Report ergänzen“: Endpoint liefert sinnvolle JSON/Ansicht; bei Datumseingabe `?date=YYYY-MM-DD` respektiert.
- „Bezahlen‑Flow anpassen“: Teilzahlungen bleiben möglich; Orders werden nur dann als bezahlt markiert, wenn keine offenen Positionen verbleiben.

## Dateikonventionen
- DB‑Schema: `server/schema.sql` (Migrationen klein halten; PRAGMA/ALTER vorsichtig einsetzen).
- Druckdateien: `prints/` nie überschreiben, nur neue Dateien anlegen.
- Frontend‑Build: niemals in `client/` committen; Build landet im Container unter `server/public`.

## Entfernen dieser Datei
Wenn keine KI‑Agenten mehr im Projekt genutzt werden oder die Leitplanken unerwünscht sind, kann `.github/copilot-instructions.md` gelöscht werden. Die Projekt‑Abläufe sind in `README.md` ausreichend dokumentiert.
