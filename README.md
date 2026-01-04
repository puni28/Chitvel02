# Chitvel House Mapper v1.01

A simple web-based house mapping application for marking and managing house locations on a map.

## Version 1.01 Features

✓ Add House Blocks - Click "Add House" button to place new blocks on map
✓ Move Houses - Drag blocks to reposition  
✓ Edit House Details - Click to open editor and edit label, width, height
✓ Save Changes - Click Save button to persist to database
✓ Delete Houses - Double-click any block to delete immediately
✓ Delete Key Support - Select block and press Delete key
✓ Draggable Editor - Move editor panel by dragging title bar
✓ Responsive UI - Editor appears centered on screen
✓ Background Map - Supports map.png or map.jpg as background
✓ SQLite Database - All changes persisted automatically

## Quick Start

1. Install Python (3.8+). If not installed, download from https://www.python.org/downloads/
2. Create and activate a virtual environment:

```powershell
cd "C:\Users\prath\Python\Chitvel02"
python -m venv venv
.\venv\Scripts\Activate.ps1
```

3. Install dependencies:

```powershell
pip install -r requirements.txt
```

4. Place your static map image at `static/map.png` (a screenshot of Chitvel).

5. Run the server:

```powershell
uvicorn app.main:app --reload
```

6. Open http://127.0.0.1:8000/ in your browser.

Notes
- Data is stored in `data.db` (SQLite) in the project root.
- The frontend is at `static/index.html` and talks to `/api/objects` for CRUD operations.
