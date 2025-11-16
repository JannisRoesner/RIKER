# Kassensystem (POS) — Minimal scaffold

This repository contains a minimal POS web app (mobile-first) with:
- `server/` — Express API and SQLite database
- `client/` — React + Vite frontend
- `Dockerfile` — builds client and runs server in a single container

Quick local (PowerShell) commands:

```powershell
# initialize DB (optional, Docker container will also run schema on start)
node server/scripts/init_db.js

# build and run container
docker build -t kassensystem:local .
docker run --rm -p 3000:3000 -v ${PWD}/data:/app/data -v ${PWD}/prints:/app/prints kassensystem:local

# open the UI at http://localhost:3000
```

API endpoints implemented (see `server/index.js`):
- GET /api/menu
- POST /api/orders
- GET /api/orders[?status=]
- POST /api/orders/:id/pay
- POST /api/orders/:id/complete
- POST /api/orders/:id/pay-items (per-order item selection)

Table aggregation endpoints:
- GET /api/tables/:number/items — all unpaid items across orders for a table
- POST /api/tables/:number/pay-items { itemIds: number[] } — mark selected items as paid across orders for that table

Admin API endpoints:
- GET /api/admin/categories
- POST /api/admin/categories
- PUT /api/admin/categories/:id
- DELETE /api/admin/categories/:id
- GET /api/admin/items
- POST /api/admin/items
- PUT /api/admin/items/:id
- DELETE /api/admin/items/:id
- GET /api/admin/tables
- POST /api/admin/tables
- PUT /api/admin/tables/:id
- DELETE /api/admin/tables/:id

Files of interest:
- `server/schema.sql` — DB schema
- `server/scripts/init_db.js` — seeds sample menu
- `client/src/App.jsx` — main UI (order/kitchen/service views)
