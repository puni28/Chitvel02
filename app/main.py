from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, text
from sqlalchemy.orm import sessionmaker, declarative_base
import json

DATABASE_URL = "sqlite:///./data.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

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

Base.metadata.create_all(bind=engine)

# Migrate: add new columns to customer_edits if they don't exist yet
_new_cols = ['city', 'base_pack', 'validity', 'expiry', 'stb', 'stb_type', 'lco']
with engine.connect() as _conn:
    for _col in _new_cols:
        try:
            _conn.execute(text(f"ALTER TABLE customer_edits ADD COLUMN {_col} TEXT DEFAULT ''"))
            _conn.commit()
        except Exception:
            pass

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
            "status": o.status,
            "meta": meta,
        })
    db.close()
    return out

@app.post("/api/objects")
def create_object(obj: ObjIn):
    db = SessionLocal()
    o = Obj(type=obj.type, label=obj.label or "", x=obj.x, y=obj.y, width=obj.width, height=obj.height, status=obj.status, meta=json.dumps(obj.meta))
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
    o.status = obj.status
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
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, skipinitialspace=True)
            for row in reader:
                customer = {
                    'id':        row.get('CAN', '').strip(),
                    'name':      f"{row.get('First Name', '').strip()} {row.get('Last Name', '').strip()}",
                    'phone':     row.get('Mobile No', '').strip(),
                    'address':   f"{row.get('Address1', '').strip()} {row.get('Address2', '').strip()}".strip(),
                    'city':      row.get('City', '').strip(),
                    'status':    row.get('Status', '').strip(),
                    'stb':       row.get('STB', '').strip(),
                    'stb_type':  row.get('STB Type', '').strip(),
                    'base_pack': row.get('Base Pack', '').strip(),
                    'validity':  row.get('Validity', '').strip(),
                    'expiry':    row.get('Expiry Date', '').strip(),
                    'lco':       row.get('Lco Name', '').strip(),
                }
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
        existing.status    = edit.status
        existing.base_pack = edit.base_pack
        existing.validity  = edit.validity
        existing.expiry    = edit.expiry
        existing.stb       = edit.stb
        existing.stb_type  = edit.stb_type
        existing.lco       = edit.lco
        existing.notes     = edit.notes
    else:
        db.add(CustomerEdit(can=can, name=edit.name, phone=edit.phone, city=edit.city,
            address=edit.address, status=edit.status, base_pack=edit.base_pack,
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
            "address": edit.address, "status": edit.status, "base_pack": edit.base_pack,
            "validity": edit.validity, "expiry": edit.expiry, "stb": edit.stb,
            "stb_type": edit.stb_type, "lco": edit.lco, "notes": edit.notes}
