// ISP Customer Map — Leaflet.js
// Coordinates centered on Chitvel, Andhra Pradesh (Cuddapah district)

const MAP_CENTER = [14.1767851, 79.3255065];
const MAP_ZOOM   = 14;

const STATUS_COLOR = {
  active:   '#28a745',
  inactive: '#e53935',
  pending:  '#ff9800',
};

// ── API helpers ──────────────────────────────────────────────
const api = {
  list:   ()        => fetch('/api/objects').then(r => r.json()),
  create: (obj)     => fetch('/api/objects', { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }).then(r => r.json()),
  update: (id, obj) => fetch(`/api/objects/${id}`, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }).then(r => r.json()),
  delete: (id)      => fetch(`/api/objects/${id}`, { method: 'DELETE' }).then(r => r.json()),
};

// ── Map init ─────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);

const googleSatellite = L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  subdomains: ['0', '1', '2', '3'],
  attribution: '&copy; Google Maps',
  maxZoom: 21,
  maxNativeZoom: 21,
});

const googleHybrid = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
  subdomains: ['0', '1', '2', '3'],
  attribution: '&copy; Google Maps',
  maxZoom: 21,
  maxNativeZoom: 21,
});

const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
});

googleSatellite.addTo(map);

L.control.layers(
  { 'Google Satellite': googleSatellite, 'Google Hybrid': googleHybrid, 'Street Map': streets },
  {},
  { position: 'topright' }
).addTo(map);

// Legend
const legend = L.control({ position: 'bottomright' });
legend.onAdd = () => {
  const div = L.DomUtil.create('div', 'map-legend');
  div.innerHTML = `
    <b>Connection Status</b>
    <div><span class="legend-dot" style="background:#28a745"></span>Active</div>
    <div><span class="legend-dot" style="background:#e53935"></span>Inactive</div>
    <div><span class="legend-dot" style="background:#ff9800"></span>Pending</div>
  `;
  return div;
};
legend.addTo(map);

// ── State ────────────────────────────────────────────────────
let allObjects    = [];
let markers       = {};      // id -> L.circleMarker
let customers     = [];      // from CSV
let addMode       = false;
let editingId     = null;
let pendingLatLng = null;
let currentFilter = 'all';

// ── Marker creation ──────────────────────────────────────────
function makeMarker(obj) {
  const meta = obj.meta || {};
  const lat  = parseFloat(meta.lat);
  const lng  = parseFloat(meta.lng);
  if (!lat || !lng) return null;

  const color = STATUS_COLOR[obj.status] || '#9e9e9e';
  const name  = meta.name    || obj.label || 'Unknown';
  const phone = meta.phone   || '';
  const addr  = meta.address || '';
  const can   = meta.custId  || '';
  const notes = meta.notes   || '';

  const marker = L.circleMarker([lat, lng], {
    radius:      10,
    fillColor:   color,
    color:       '#ffffff',
    weight:      2,
    opacity:     1,
    fillOpacity: 0.9,
  });

  marker.bindPopup(buildPopup(obj.id, name, can, phone, addr, notes, obj.status, color));
  return marker;
}

function buildPopup(id, name, can, phone, addr, notes, status, color) {
  return `
    <div style="min-width:200px;font-family:Arial,sans-serif">
      <div style="font-weight:bold;font-size:14px;margin-bottom:6px;color:#1a1a2e">${escHtml(name)}</div>
      ${can   ? `<div style="font-size:12px;color:#666;margin-bottom:2px">CAN: ${escHtml(can)}</div>` : ''}
      ${phone ? `<div style="font-size:13px;margin-bottom:2px">&#128222; ${escHtml(phone)}</div>` : ''}
      ${addr  ? `<div style="font-size:12px;color:#555;margin-bottom:2px">&#128205; ${escHtml(addr)}</div>` : ''}
      ${notes ? `<div style="font-size:12px;color:#888;margin-bottom:4px">${escHtml(notes)}</div>` : ''}
      <div style="margin:8px 0">
        <span style="background:${color};color:white;padding:2px 10px;border-radius:10px;font-size:11px;text-transform:capitalize">${status}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button onclick="editMarker(${id})"   style="flex:1;padding:6px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">Edit</button>
        <button onclick="deleteMarker(${id})" style="flex:1;padding:6px;background:#e53935;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">Delete</button>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Load & render all objects ────────────────────────────────
async function loadObjects() {
  allObjects = await api.list();

  // Remove old markers
  Object.values(markers).forEach(m => m.remove());
  markers = {};

  allObjects.forEach(obj => {
    const m = makeMarker(obj);
    if (!m) return;
    markers[obj.id] = m;
    if (currentFilter === 'all' || obj.status === currentFilter) {
      m.addTo(map);
    }
  });

  updateStats();
}

function updateStats() {
  const active   = allObjects.filter(o => o.status === 'active').length;
  const inactive = allObjects.filter(o => o.status === 'inactive').length;
  const pending  = allObjects.filter(o => o.status === 'pending').length;
  document.getElementById('count-active').textContent   = active;
  document.getElementById('count-inactive').textContent = inactive;
  document.getElementById('count-pending').textContent  = pending;
  document.getElementById('count-total').textContent    = allObjects.length;
}

function applyFilter() {
  allObjects.forEach(obj => {
    const m = markers[obj.id];
    if (!m) return;
    if (currentFilter === 'all' || obj.status === currentFilter) {
      m.addTo(map);
    } else {
      m.remove();
    }
  });
}

// ── Filter buttons ───────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilter();
  });
});

// ── Add mode ─────────────────────────────────────────────────
const addBtn    = document.getElementById('add-customer-btn');
const addBanner = document.getElementById('add-mode-banner');

addBtn.addEventListener('click', () => {
  addMode = !addMode;
  if (addMode) {
    addBtn.textContent = 'Cancel';
    addBtn.classList.add('adding');
    addBanner.classList.remove('hidden');
    map.getContainer().style.cursor = 'crosshair';
  } else {
    cancelAddMode();
  }
});

function cancelAddMode() {
  addMode = false;
  addBtn.textContent = '+ Add Customer';
  addBtn.classList.remove('adding');
  addBanner.classList.add('hidden');
  map.getContainer().style.cursor = '';
}

map.on('click', e => {
  if (!addMode) return;
  pendingLatLng = e.latlng;
  editingId     = null;
  clearForm();
  document.getElementById('coords-display').textContent =
    `Location: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
  openModal('Add Customer');
  cancelAddMode();
});

// ── Modal ────────────────────────────────────────────────────
function openModal(title) {
  document.getElementById('modal-title').textContent = title;
  const delBtn = document.getElementById('btn-delete');
  editingId ? delBtn.classList.remove('hidden') : delBtn.classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId     = null;
  pendingLatLng = null;
  clearForm();
}

function clearForm() {
  document.getElementById('fld-can').value     = '';
  document.getElementById('fld-name').value    = '';
  document.getElementById('fld-phone').value   = '';
  document.getElementById('fld-address').value = '';
  document.getElementById('fld-status').value  = 'active';
  document.getElementById('fld-notes').value   = '';
  document.getElementById('coords-display').textContent = '';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── Customer CSV select ──────────────────────────────────────
document.getElementById('fld-can').addEventListener('change', () => {
  const id   = document.getElementById('fld-can').value;
  const cust = customers.find(c => c.id === id);
  if (!cust) return;
  document.getElementById('fld-name').value    = cust.name    || '';
  document.getElementById('fld-phone').value   = cust.phone   || '';
  document.getElementById('fld-address').value = cust.address || '';
  const s = (cust.status || '').toLowerCase();
  document.getElementById('fld-status').value  = s === 'active' ? 'active' : s === 'pending' ? 'pending' : 'inactive';
});

// ── Save ─────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', async () => {
  const name = document.getElementById('fld-name').value.trim();
  if (!name) { alert('Please enter a customer name.'); return; }

  const status = document.getElementById('fld-status').value;

  let lat, lng;
  if (editingId) {
    const existing = allObjects.find(o => o.id === editingId);
    lat = existing?.meta?.lat;
    lng = existing?.meta?.lng;
  } else {
    lat = pendingLatLng.lat;
    lng = pendingLatLng.lng;
  }

  const meta = {
    custId:  document.getElementById('fld-can').value,
    name,
    phone:   document.getElementById('fld-phone').value.trim(),
    address: document.getElementById('fld-address').value.trim(),
    notes:   document.getElementById('fld-notes').value.trim(),
    lat,
    lng,
  };

  const payload = {
    type:   'customer',
    label:  name,
    x: 0, y: 0, width: 0, height: 0,
    status,
    meta,
  };

  if (editingId) {
    await api.update(editingId, payload);
  } else {
    await api.create(payload);
  }

  closeModal();
  await loadObjects();
});

// ── Delete ───────────────────────────────────────────────────
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Delete this customer marker?')) return;
  await api.delete(editingId);
  closeModal();
  await loadObjects();
});

// ── Edit / Delete from popup (global functions) ───────────────
window.editMarker = function(id) {
  const obj = allObjects.find(o => o.id === id);
  if (!obj) return;
  const meta = obj.meta || {};
  editingId = id;
  document.getElementById('fld-can').value     = meta.custId  || '';
  document.getElementById('fld-name').value    = meta.name    || obj.label || '';
  document.getElementById('fld-phone').value   = meta.phone   || '';
  document.getElementById('fld-address').value = meta.address || '';
  document.getElementById('fld-status').value  = obj.status   || 'active';
  document.getElementById('fld-notes').value   = meta.notes   || '';
  document.getElementById('coords-display').textContent =
    meta.lat ? `Location: ${parseFloat(meta.lat).toFixed(6)}, ${parseFloat(meta.lng).toFixed(6)}` : '';
  map.closePopup();
  openModal('Edit Customer');
};

window.deleteMarker = async function(id) {
  if (!confirm('Delete this customer?')) return;
  await api.delete(id);
  map.closePopup();
  await loadObjects();
};

// ── ESC key ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (addMode) cancelAddMode();
    else closeModal();
  }
});

// ── Load CSV customers ───────────────────────────────────────
async function loadCustomers() {
  try {
    customers = await fetch('/api/customers').then(r => r.json());
    const sel = document.getElementById('fld-can');
    customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c.id;
      opt.textContent = `${c.name} — ${c.phone}`;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('Could not load customer list:', e);
  }
}

// ── Customers Tab ────────────────────────────────────────────
function renderCustomerTable(list) {
  const tbody = document.getElementById('customers-tbody');
  const count = document.getElementById('customers-count');
  tbody.innerHTML = '';
  count.textContent = `${list.length} customer${list.length !== 1 ? 's' : ''}`;
  list.forEach(c => {
    const s = (c.status || '').toLowerCase();
    const badge = ['active','inactive','pending'].includes(s) ? s : 'unknown';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(c.id)}</td>
      <td>${escHtml(c.name)}</td>
      <td>${escHtml(c.phone)}</td>
      <td>${escHtml(c.address)}</td>
      <td><span class="status-badge ${badge}">${escHtml(c.status || '—')}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('customer-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  const filtered = customers.filter(c =>
    (c.name    || '').toLowerCase().includes(q) ||
    (c.phone   || '').toLowerCase().includes(q) ||
    (c.address || '').toLowerCase().includes(q) ||
    (c.id      || '').toLowerCase().includes(q)
  );
  renderCustomerTable(filtered);
});

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    const mapEl       = document.getElementById('map');
    const panel       = document.getElementById('customers-panel');
    const navbarRight = document.getElementById('navbar-right');
    const addBanner   = document.getElementById('add-mode-banner');

    if (tab === 'map') {
      mapEl.classList.remove('hidden');
      panel.classList.add('hidden');
      navbarRight.classList.remove('hidden');
      map.invalidateSize();
    } else {
      mapEl.classList.add('hidden');
      panel.classList.remove('hidden');
      navbarRight.classList.add('hidden');
      addBanner.classList.add('hidden');
      if (addMode) cancelAddMode();
      renderCustomerTable(customers);
      document.getElementById('customer-search').value = '';
    }
  });
});

// ── Boot ─────────────────────────────────────────────────────
loadCustomers();
loadObjects();

// Fix Leaflet rendering if container size wasn't ready at init
window.addEventListener('load', () => map.invalidateSize());
