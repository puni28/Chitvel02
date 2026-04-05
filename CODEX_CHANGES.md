# Codex Change Notes

## Why These Changes Were Made

These changes were made after a QA pass uncovered several functional issues that affected reliability and user-facing behavior.

## Problems Found

1. The app could fail to start because SQLite writes were erroring with `disk I/O error`.
2. Customer statuses were inconsistent across the backend, CSV data, and frontend UI.
3. Map colors, filter buttons, and summary counts were incorrect for many real customer records.
4. Customer edits saved from the Customers tab did not show back up in the table and detail view.
5. The `customer_edits` schema migration logic did not include the `notes` field, which risked runtime failures on older databases.

## What Changed

### Backend

- Added database path resolution and runtime database fallback logic in [app/main.py](/c:/Projects/Chitvel02/app/main.py).
- Added SQLite connection configuration to use a journal mode that works in this workspace.
- Added status normalization so API responses and saved records use consistent values: `active`, `inactive`, and `pending`.
- Extended migration handling for `customer_edits`, including the missing `notes` column.
- Updated `/api/customers` to merge saved customer edits into the CSV-backed customer data before returning it.

### Frontend

- Updated status dropdowns to use normalized values in [static/index.html](/c:/Projects/Chitvel02/static/index.html).
- Added frontend status normalization and label formatting in [static/app.js](/c:/Projects/Chitvel02/static/app.js).
- Fixed map marker color selection, filtering, and stats calculation so they use normalized statuses.
- Updated customer list and detail rendering so edited customer records display correctly.
- Updated the Customers tab edit flow so saved edits immediately update the in-memory list shown in the UI.

## Why The Database Fallback Exists

The original project database in this workspace had SQLite journal-related failures and could not be used reliably during startup or write operations. The runtime fallback allows the app to boot and function instead of crashing.

This was chosen as the safest code-level fix within the current environment because:

- the original `data.db` was already in a broken state,
- journaled SQLite writes were failing in this workspace,
- the app needed to remain usable for testing and continued development.

## Important Caveat

The original `data.db` was not repaired by this change. The app now prefers a clean runtime database when the original one is unusable. If you want long-term persistence against the original database again, that database should be repaired or replaced separately.

## Verification Performed

- Confirmed the app responds successfully on `http://127.0.0.1:8000/`.
- Confirmed `POST /api/objects` works again.
- Confirmed `PUT /api/customer-edits/{can}` and `GET /api/customer-edits/{can}` work again.
- Confirmed `/api/customers` returns merged edited customer data.
- Confirmed new map objects are stored with normalized statuses.
