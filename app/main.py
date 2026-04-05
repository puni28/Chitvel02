from pathlib import Path
import sqlite3
import json

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, text, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = Path(__file__).resolve().parent.parent
PRIMARY_DATABASE_PATH = BASE_DIR / "data.db"
FALLBACK_DATABASE_PATH = BASE_DIR / "data.runtime.db"


def database_is_usable(path: Path) -> bool:
    journal_path = path.with_name(f"{path.name}-journal")
    if journal_path.exists():
        return False
    if not path.exists():
        return True
    try:
        with sqlite3.connect(path) as conn:
            conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        return True
    except sqlite3.Error:
        return False


def resolve_database_path() -> Path:
    if database_is_usable(PRIMARY_DATABASE_PATH):
        return PRIMARY_DATABASE_PATH
    if database_is_usable(FALLBACK_DATABASE_PATH):
        return FALLBACK_DATABASE_PATH
    for index in range(1, 100):
        candidate = BASE_DIR / f"data.runtime.{index}.db"
        if database_is_usable(candidate):
            return candidate
    return BASE_DIR / "data.runtime.recovered.db"


DATABASE_PATH = resolve_database_path()
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


@event.listens_for(engine, "connect")
def configure_sqlite(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=MEMORY")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()

class Obj(Base):
    __tablename__ = "objects"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, index=True)
    label = Column(String, default="")
    x = Column(Integer, default=0)
    y = Column(Integer, default=0)
    width = Column(Integer, default=50)
    height = Column(Integer, default=50)
    status = Column(String, default="")
    meta = Column(Text, default="{}")

class CustomerEdit(Base):
    __tablename__ = "customer_edits"
    can      = Column(String, primary_key=True)
    name     = Column(String, default="")
    phone    = Column(String, default="")
    city     = Column(String, default="")
    address  = Column(String, default="")
    status   = Column(String, default="")
    base_pack= Column(String, default="")
    validity = Column(String, default="")
    expiry   = Column(String, default="")
    stb      = Column(String, default="")
    stb_type = Column(String, default="")
    lco      = Column(String, default="")
    notes    = Column(String, default="")

def normalize_status(value: str) -> str:
    raw = (value or "").strip().lower()
    if raw in {"active", "sd", "hd"}:
        return "active"
    if raw in {"inactive", "expired", "temp dc"}:
        return "inactive"
    if raw in {"pending", "new"}:
        return "pending"
    return raw


def migrate_customer_edits() -> None:
    new_cols = ["city", "base_pack", "validity", "expiry", "stb", "stb_type", "lco", "notes"]
    with engine.connect() as conn:
        for col in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE customer_edits ADD COLUMN {col} TEXT DEFAULT ''"))
                conn.commit()
            except Exception:
                pass


def initialize_database() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        migrate_customer_edits()
    except OperationalError as exc:
        raise RuntimeError(f"Database initialization failed for {DATABASE_PATH}") from exc


initialize_database()

class CustomerEditIn(BaseModel):
    name:     str = ""
    phone:    str = ""
    city:     str = ""
    address:  str = ""
    status:   str = ""
    base_pack:str = ""
    validity: str = ""
    expiry:   str = ""
    stb:      str = ""
    stb_type: str = ""
    lco:      str = ""
    notes:    str = ""

class ObjIn(BaseModel):
    type: str
    label: str = ""
    x: int = 0
    y: int = 0
    width: int = 50
    height: int = 50
    status: str = ""
    meta: dict = {}

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Serve static frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def index():
    return FileResponse("static/index.html")

@app.get("/api/objects")
def list_objects():
    db = SessionLocal()
    objs = db.query(Obj).all()
    out = []
    for o in objs:
        try:
            meta = json.loads(o.meta)
        except:
            meta = {}
        out.append({
            "id": o.id,
            "type": o.type,
            "label": o.label,
            "x": o.x,
            "y": o.y,
            "width": o.width,
            "height": o.height,
            "status": normalize_status(o.status),
            "meta": meta,
        })
    db.close()
    return out

@app.post("/api/objects")
def create_object(obj: ObjIn):
    db = SessionLocal()
    o = Obj(type=obj.type, label=obj.label or "", x=obj.x, y=obj.y, width=obj.width, height=obj.height, status=normalize_status(obj.status), meta=json.dumps(obj.meta))
    db.add(o)
    db.commit()
    db.refresh(o)
    db.close()
    return {"id": o.id}

@app.put("/api/objects/{obj_id}")
def update_object(obj_id: int, obj: ObjIn):
    db = SessionLocal()
    o = db.query(Obj).filter(Obj.id == obj_id).first()
    if not o:
        raise HTTPException(404, "Not found")
    o.type = obj.type
    o.label = obj.label
    o.x = obj.x
    o.y = obj.y
    o.width = obj.width
    o.height = obj.height
    o.status = normalize_status(obj.status)
    o.meta = json.dumps(obj.meta)
    db.commit()
    db.refresh(o)
    db.close()
    return {"ok": True}

@app.delete("/api/objects/{obj_id}")
def delete_object(obj_id: int):
    db = SessionLocal()
    o = db.query(Obj).filter(Obj.id == obj_id).first()
    if not o:
        raise HTTPException(404, "Not found")
    db.delete(o)
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/api/customers")
def get_customers():
    import csv, os
    customers = []
    csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'nxt_customers_list.csv'))
    db = SessionLocal()
    edit_rows = db.query(CustomerEdit).all()
    db.close()
    edits = {row.can: row for row in edit_rows}
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, skipinitialspace=True)
            for row in reader:
                can = row.get('CAN', '').strip()
                customer = {
                    'id':        can,
                    'name':      f"{row.get('First Name', '').strip()} {row.get('Last Name', '').strip()}",
                    'phone':     row.get('Mobile No', '').strip(),
                    'address':   f"{row.get('Address1', '').strip()} {row.get('Address2', '').strip()}".strip(),
                    'city':      row.get('City', '').strip(),
                    'status':    normalize_status(row.get('Status', '').strip()),
                    'stb':       row.get('STB', '').strip(),
                    'stb_type':  row.get('STB Type', '').strip(),
                    'base_pack': row.get('Base Pack', '').strip(),
                    'validity':  row.get('Validity', '').strip(),
                    'expiry':    row.get('Expiry Date', '').strip(),
                    'lco':       row.get('Lco Name', '').strip(),
                    'notes':     '',
                }
                edit = edits.get(can)
                if edit:
                    for field in ['name', 'phone', 'city', 'address', 'status', 'base_pack', 'validity', 'expiry', 'stb', 'stb_type', 'lco']:
                        value = getattr(edit, field, "")
                        if value:
                            customer[field] = normalize_status(value) if field == 'status' else value
                    customer['notes'] = edit.notes or ''
                if customer['id']:
                    customers.append(customer)
    except Exception as e:
        return {"error": str(e), "csv_path": csv_path}
    return customers

@app.put("/api/customer-edits/{can}")
def save_customer_edit(can: str, edit: CustomerEditIn):
    db = SessionLocal()
    existing = db.query(CustomerEdit).filter(CustomerEdit.can == can).first()
    if existing:
        existing.name      = edit.name
        existing.phone     = edit.phone
        existing.city      = edit.city
        existing.address   = edit.address
        existing.status    = normalize_status(edit.status)
        existing.base_pack = edit.base_pack
        existing.validity  = edit.validity
        existing.expiry    = edit.expiry
        existing.stb       = edit.stb
        existing.stb_type  = edit.stb_type
        existing.lco       = edit.lco
        existing.notes     = edit.notes
    else:
        db.add(CustomerEdit(can=can, name=edit.name, phone=edit.phone, city=edit.city,
            address=edit.address, status=normalize_status(edit.status), base_pack=edit.base_pack,
            validity=edit.validity, expiry=edit.expiry, stb=edit.stb,
            stb_type=edit.stb_type, lco=edit.lco, notes=edit.notes))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/api/customer-edits/{can}")
def get_customer_edit(can: str):
    db = SessionLocal()
    edit = db.query(CustomerEdit).filter(CustomerEdit.can == can).first()
    db.close()
    if not edit:
        return {}
    return {"name": edit.name, "phone": edit.phone, "city": edit.city,
            "address": edit.address, "status": normalize_status(edit.status), "base_pack": edit.base_pack,
            "validity": edit.validity, "expiry": edit.expiry, "stb": edit.stb,
            "stb_type": edit.stb_type, "lco": edit.lco, "notes": edit.notes}
