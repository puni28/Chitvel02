// ISP Customer Map — Leaflet.js
// Coordinates centered on Chitvel, Andhra Pradesh (Cuddapah district)

const MAP_CENTER = [14.1767851, 79.3255065];
const MAP_ZOOM   = 14;

const STATUS_COLOR = {
  active:   '#28a745',
  inactive: '#e53935',
  pending:  '#ff9800',
};

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['active', 'sd', 'hd'].includes(raw)) return 'active';
  if (['inactive', 'expired', 'temp dc'].includes(raw)) return 'inactive';
  if (['pending', 'new'].includes(raw)) return 'pending';
  return raw;
}

function formatStatusLabel(value) {
  const normalized = normalizeStatus(value);
  if (!normalized) return 'Unknown';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

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

  const normalizedStatus = normalizeStatus(obj.status);
  const color = STATUS_COLOR[normalizedStatus] || '#9e9e9e';
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

  marker.bindPopup(buildPopup(obj.id, name, can, phone, addr, notes, normalizedStatus, color));
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
    if (currentFilter === 'all' || normalizeStatus(obj.status) === currentFilter) {
      m.addTo(map);
    }
  });

  updateStats();
}

function updateStats() {
  const active   = allObjects.filter(o => normalizeStatus(o.status) === 'active').length;
  const inactive = allObjects.filter(o => normalizeStatus(o.status) === 'inactive').length;
  const pending  = allObjects.filter(o => normalizeStatus(o.status) === 'pending').length;
  document.getElementById('count-active').textContent   = active;
  document.getElementById('count-inactive').textContent = inactive;
  document.getElementById('count-pending').textContent  = pending;
  document.getElementById('count-total').textContent    = allObjects.length;
}

function applyFilter() {
  allObjects.forEach(obj => {
    const m = markers[obj.id];
    if (!m) return;
    if (currentFilter === 'all' || normalizeStatus(obj.status) === currentFilter) {
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
  document.getElementById('fld-can').value      = '';
  document.getElementById('fld-name').value     = '';
  document.getElementById('fld-phone').value    = '';
  document.getElementById('fld-city').value     = '';
  document.getElementById('fld-address').value  = '';
  document.getElementById('fld-status').value   = 'active';
  document.getElementById('fld-base-pack').value= '';
  document.getElementById('fld-validity').value = '';
  document.getElementById('fld-expiry').value   = '';
  document.getElementById('fld-stb-type').value = '';
  document.getElementById('fld-stb').value      = '';
  document.getElementById('fld-lco').value      = '';
  document.getElementById('fld-notes').value    = '';
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
  document.getElementById('fld-name').value     = cust.name     || '';
  document.getElementById('fld-phone').value    = cust.phone    || '';
  document.getElementById('fld-city').value     = cust.city     || '';
  document.getElementById('fld-address').value  = cust.address  || '';
  document.getElementById('fld-base-pack').value= cust.base_pack|| '';
  document.getElementById('fld-validity').value = cust.validity  || '';
  document.getElementById('fld-expiry').value   = cust.expiry   || '';
  document.getElementById('fld-stb-type').value = cust.stb_type || '';
  document.getElementById('fld-stb').value      = cust.stb      || '';
  document.getElementById('fld-lco').value      = cust.lco      || '';
  const s = normalizeStatus(cust.status);
  const sel = document.getElementById('fld-status');
  sel.value = s;
  if (!sel.value) sel.selectedIndex = 0;
});

// ── Save ─────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', async () => {
  const name = document.getElementById('fld-name').value.trim();
  if (!name) { alert('Please enter a customer name.'); return; }

  const status = normalizeStatus(document.getElementById('fld-status').value);

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
    custId:   document.getElementById('fld-can').value,
    name,
    phone:    document.getElementById('fld-phone').value.trim(),
    city:     document.getElementById('fld-city').value.trim(),
    address:  document.getElementById('fld-address').value.trim(),
    basePack: document.getElementById('fld-base-pack').value.trim(),
    validity: document.getElementById('fld-validity').value.trim(),
    expiry:   document.getElementById('fld-expiry').value.trim(),
    stbType:  document.getElementById('fld-stb-type').value.trim(),
    stb:      document.getElementById('fld-stb').value.trim(),
    lco:      document.getElementById('fld-lco').value.trim(),
    notes:    document.getElementById('fld-notes').value.trim(),
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
  document.getElementById('fld-can').value      = meta.custId  || '';
  document.getElementById('fld-name').value     = meta.name    || obj.label || '';
  document.getElementById('fld-phone').value    = meta.phone   || '';
  document.getElementById('fld-city').value     = meta.city    || '';
  document.getElementById('fld-address').value  = meta.address || '';
  const sel = document.getElementById('fld-status');
  sel.value = normalizeStatus(obj.status) || 'active';
  if (!sel.value) sel.selectedIndex = 0;
  document.getElementById('fld-base-pack').value= meta.basePack|| '';
  document.getElementById('fld-validity').value = meta.validity || '';
  document.getElementById('fld-expiry').value   = meta.expiry  || '';
  document.getElementById('fld-stb-type').value = meta.stbType || '';
  document.getElementById('fld-stb').value      = meta.stb     || '';
  document.getElementById('fld-lco').value      = meta.lco     || '';
  document.getElementById('fld-notes').value    = meta.notes   || '';
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
    if (!document.getElementById('cust-edit-overlay').classList.contains('hidden')) {
      closeCustomerEdit();
    } else if (!document.getElementById('cust-detail-overlay').classList.contains('hidden')) {
      document.getElementById('cust-detail-overlay').classList.add('hidden');
    } else if (addMode) {
      cancelAddMode();
    } else {
      closeModal();
    }
  }
});

// ── Load CSV customers ───────────────────────────────────────
async function loadCustomers() {
  try {
    customers = await fetch('/api/customers').then(r => r.json());
    const sel = document.getElementById('fld-can');
    sel.innerHTML = '<option value="">-- Select existing customer --</option>';
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
    const s = normalizeStatus(c.status);
    const badge = ['active','inactive','pending'].includes(s) ? s : 'unknown';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(c.id)}</td>
      <td>${escHtml(c.name)}</td>
      <td>${escHtml(c.phone)}</td>
      <td>${escHtml(c.address)}</td>
      <td><span class="status-badge ${badge}">${escHtml(formatStatusLabel(c.status))}</span></td>
      <td class="actions-cell">
        <button class="row-btn view-btn">View</button>
        <button class="row-btn edit-btn">Edit</button>
      </td>
    `;
    tr.querySelector('.view-btn').addEventListener('click', () => openCustomerView(c));
    tr.querySelector('.edit-btn').addEventListener('click', () => openCustomerEdit(c));
    tbody.appendChild(tr);
  });
}

function openCustomerView(c) {
  const s = normalizeStatus(c.status);
  const badge = ['active','inactive','pending'].includes(s) ? s : 'unknown';
  document.getElementById('cust-detail-title').textContent = c.name || 'Customer Details';
  document.getElementById('cust-detail-body').innerHTML = `
    <div class="detail-field"><span class="detail-label">CAN</span><span class="detail-value">${escHtml(c.id)}</span></div>
    <div class="detail-field"><span class="detail-label">Status</span><span class="detail-value"><span class="status-badge ${badge}">${escHtml(formatStatusLabel(c.status))}</span></span></div>
    <div class="detail-field"><span class="detail-label">Name</span><span class="detail-value">${escHtml(c.name)}</span></div>
    <div class="detail-field"><span class="detail-label">Phone</span><span class="detail-value">${escHtml(c.phone)}</span></div>
    <div class="detail-field"><span class="detail-label">City</span><span class="detail-value">${escHtml(c.city)}</span></div>
    <div class="detail-field full-width"><span class="detail-label">Address</span><span class="detail-value">${escHtml(c.address)}</span></div>
    <div class="detail-field"><span class="detail-label">Base Pack</span><span class="detail-value">${escHtml(c.base_pack)}</span></div>
    <div class="detail-field"><span class="detail-label">Validity</span><span class="detail-value">${escHtml(c.validity)}</span></div>
    <div class="detail-field"><span class="detail-label">Expiry Date</span><span class="detail-value">${escHtml(c.expiry)}</span></div>
    <div class="detail-field"><span class="detail-label">STB Type</span><span class="detail-value">${escHtml(c.stb_type)}</span></div>
    <div class="detail-field full-width"><span class="detail-label">STB Serial</span><span class="detail-value">${escHtml(c.stb)}</span></div>
    <div class="detail-field full-width"><span class="detail-label">LCO</span><span class="detail-value">${escHtml(c.lco)}</span></div>
    <div class="detail-field full-width"><span class="detail-label">Notes</span><span class="detail-value">${escHtml(c.notes || '')}</span></div>
  `;
  document.getElementById('cust-detail-overlay').classList.remove('hidden');
}

document.getElementById('cust-detail-close').addEventListener('click', () => {
  document.getElementById('cust-detail-overlay').classList.add('hidden');
});
document.getElementById('cust-detail-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('cust-detail-overlay'))
    document.getElementById('cust-detail-overlay').classList.add('hidden');
});

// ── Customer Edit Modal ──────────────────────────────────────
function openCustomerEdit(c) {
  document.getElementById('edit-can').value      = c.id;
  document.getElementById('edit-name').value     = c.name     || '';
  document.getElementById('edit-phone').value    = c.phone    || '';
  document.getElementById('edit-city').value     = c.city     || '';
  document.getElementById('edit-address').value  = c.address  || '';
  document.getElementById('edit-base-pack').value= c.base_pack|| '';
  document.getElementById('edit-validity').value = c.validity  || '';
  document.getElementById('edit-expiry').value   = c.expiry   || '';
  document.getElementById('edit-stb-type').value = c.stb_type || '';
  document.getElementById('edit-stb').value      = c.stb      || '';
  document.getElementById('edit-lco').value      = c.lco      || '';
  document.getElementById('edit-notes').value    = c.notes || '';
  const sel = document.getElementById('edit-status');
  sel.value = normalizeStatus(c.status);
  if (!sel.value) sel.selectedIndex = 0;
  // Load any previously saved edits
  fetch(`/api/customer-edits/${encodeURIComponent(c.id)}`).then(r => r.json()).then(edit => {
    if (edit.name)     document.getElementById('edit-name').value     = edit.name;
    if (edit.phone)    document.getElementById('edit-phone').value    = edit.phone;
    if (edit.city)     document.getElementById('edit-city').value     = edit.city;
    if (edit.address)  document.getElementById('edit-address').value  = edit.address;
    if (edit.base_pack)document.getElementById('edit-base-pack').value= edit.base_pack;
    if (edit.validity) document.getElementById('edit-validity').value = edit.validity;
    if (edit.expiry)   document.getElementById('edit-expiry').value   = edit.expiry;
    if (edit.stb_type) document.getElementById('edit-stb-type').value = edit.stb_type;
    if (edit.stb)      document.getElementById('edit-stb').value      = edit.stb;
    if (edit.lco)      document.getElementById('edit-lco').value      = edit.lco;
    if (edit.notes)    document.getElementById('edit-notes').value    = edit.notes;
    if (edit.status)   { sel.value = normalizeStatus(edit.status); if (!sel.value) sel.selectedIndex = 0; }
  }).catch(() => {});
  document.getElementById('cust-edit-overlay').classList.remove('hidden');
}

function closeCustomerEdit() {
  document.getElementById('cust-edit-overlay').classList.add('hidden');
}

document.getElementById('cust-edit-close').addEventListener('click', closeCustomerEdit);
document.getElementById('edit-cancel-btn').addEventListener('click', closeCustomerEdit);
document.getElementById('cust-edit-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('cust-edit-overlay')) closeCustomerEdit();
});

document.getElementById('edit-save-btn').addEventListener('click', async () => {
  const can = document.getElementById('edit-can').value;
  const payload = {
    name:     document.getElementById('edit-name').value.trim(),
    phone:    document.getElementById('edit-phone').value.trim(),
    city:     document.getElementById('edit-city').value.trim(),
    address:  document.getElementById('edit-address').value.trim(),
    status:   normalizeStatus(document.getElementById('edit-status').value),
    base_pack:document.getElementById('edit-base-pack').value.trim(),
    validity: document.getElementById('edit-validity').value.trim(),
    expiry:   document.getElementById('edit-expiry').value.trim(),
    stb_type: document.getElementById('edit-stb-type').value.trim(),
    stb:      document.getElementById('edit-stb').value.trim(),
    lco:      document.getElementById('edit-lco').value.trim(),
    notes:    document.getElementById('edit-notes').value.trim(),
  };
  await fetch(`/api/customer-edits/${encodeURIComponent(can)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const index = customers.findIndex(c => c.id === can);
  if (index >= 0) {
    customers[index] = { ...customers[index], ...payload };
  }
  renderCustomerTable(customers);
  closeCustomerEdit();
});

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
