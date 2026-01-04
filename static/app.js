// Minimal Konva-based editor: load background image, fetch objects, allow add/drag/resize, save via API

const api = {
  list: () => fetch('/api/objects').then(r => r.json()),
  create: (obj) => fetch('/api/objects', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(obj)}).then(r=>r.json()),
  update: (id, obj) => fetch(`/api/objects/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(obj)}).then(r=>r.json()),
  delete: (id) => fetch(`/api/objects/${id}`, {method:'DELETE'}).then(r=>r.json()),
}

const stageWidth = 1000, stageHeight = 700;
const stage = new Konva.Stage({ container: 'container', width: stageWidth, height: stageHeight });
const layer = new Konva.Layer();
stage.add(layer);

// background image placeholder - try map.png then fallback to map.jpg
const bgImage = new Image();
function setupBackground(img){
  stage.width(img.width);
  stage.height(img.height);
  const bg = new Konva.Image({ image: img, x:0, y:0 });
  layer.add(bg);
  layer.draw();
  loadObjects();
}

bgImage.onload = () => setupBackground(bgImage);
bgImage.onerror = () => {
  const alt = new Image();
  alt.onload = () => setupBackground(alt);
  alt.onerror = () => {
    // no background found; keep default stage size
    loadObjects();
  };
  alt.src = '/static/map.jpg';
};
bgImage.src = '/static/map.png';

const transformer = new Konva.Transformer({ rotateEnabled: false, enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'] });
layer.add(transformer);

function makeFill(status){
  if(status === 'customer') return 'green';
  return 'red';
}

function createRectFromObj(obj){
  const rect = new Konva.Rect({
    x: obj.x, y: obj.y, width: obj.width, height: obj.height,
    fill: makeFill(obj.status), opacity: 0.6, stroke: '#333', strokeWidth: 1, draggable: true
  });
  rect.objId = obj.id;
  rect.objType = obj.type;
  rect.status = obj.status;
  rect.label = obj.label || '';
  // label text
  const text = new Konva.Text({ x: obj.x, y: obj.y - 16, text: rect.label, fontSize: 12, fill: '#000' });
  rect._label = text;
  layer.add(rect);
  layer.add(text);

  rect.on('dragend', ()=> { updateLabelPos(rect); saveShape(rect); });
  rect.on('transformend', ()=> { normalizeRect(rect); updateLabelPos(rect); saveShape(rect); });

  rect.on('click', (e)=>{
    selectedShape = rect;
    transformer.nodes([rect]);
    showEditorFor(rect);
    layer.draw();
  });

  rect.on('dblclick', ()=>{
    selectedShape = rect;
    transformer.nodes([rect]);
    showEditorFor(rect);
  });

  rect.on('mouseover', ()=> {
    stage.container().style.cursor = 'move';
    shapeUnderMouse = rect;
  });
  
  rect.on('mouseout', ()=> {
    stage.container().style.cursor = 'default';
    shapeUnderMouse = null;
  });

  return rect;
}

async function loadObjects(){
  const objs = await api.list();
  objs.forEach(o=>{
    const rect = createRectFromObj(o);
    rect.objId = o.id;
    rect.label = o.label || '';
    rect._label.text(rect.label);
  });
  layer.draw();
}

// Global variable to track which shape is under the mouse
let shapeUnderMouse = null;

// Simple context menu handler
const contextMenu = document.getElementById('context-menu');
let contextMenuShape = null;
let previousCustomer = null;

// Show context menu at mouse position
function showContextMenu(x, y, rect){
  contextMenuShape = rect;
  contextMenu.style.position = 'fixed';
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.remove('hidden');
}

// Hide context menu
function hideContextMenu(){
  contextMenu.classList.add('hidden');
  contextMenuShape = null;
}

// Handle all context menu item clicks
contextMenu.addEventListener('click', async (e)=>{
  const item = e.target.closest('.context-item');
  if(!item || !contextMenuShape) return;
  
  const action = item.dataset.action;
  const rect = contextMenuShape;
  
  console.log('Context menu action:', action);
  
  switch(action){
    case 'edit':
      selectedShape = rect;
      transformer.nodes([rect]);
      showEditorFor(rect);
      layer.draw();
      break;
      
    case 'delete':
      if(rect.objId) await api.delete(rect.objId);
      if(rect._label) rect._label.destroy();
      rect.destroy();
      layer.draw();
      break;
      
    case 'choose-customer':
      selectedShape = rect;
      transformer.nodes([rect]);
      showEditorFor(rect);
      fldCustSelect.focus();
      break;
      
    case 'enter-manual':
      const name = prompt('Enter customer name:');
      if(name !== null){
        previousCustomer = { custId: rect.meta?.custId || '', name: rect.meta?.name || '', phone: rect.meta?.phone || '' };
        rect.meta = { custId: '', name: name, phone: rect.meta?.phone || '' };
        rect._label.text(name);
        updateLabelPos(rect);
        await saveShape(rect);
        layer.draw();
      }
      break;
      
    case 'non-customer':
      previousCustomer = { custId: rect.meta?.custId || '', name: rect.meta?.name || '', phone: rect.meta?.phone || '' };
      rect.status = 'non_customer';
      rect.fill(makeFill('non_customer'));
      rect.meta = { custId: '', name: '', phone: '' };
      rect._label.text('');
      updateLabelPos(rect);
      await saveShape(rect);
      layer.draw();
      break;
      
    case 'prev-customer':
      if(previousCustomer){
        rect.meta = { custId: previousCustomer.custId, name: previousCustomer.name, phone: previousCustomer.phone };
        rect.status = previousCustomer.custId ? 'customer' : 'non_customer';
        rect.fill(makeFill(rect.status));
        rect._label.text(previousCustomer.name || '');
        updateLabelPos(rect);
        await saveShape(rect);
        layer.draw();
      }
      break;
  }
  
  hideContextMenu();
});

// Prevent default context menu and close on clicks outside
document.addEventListener('contextmenu', (e)=>{
  e.preventDefault();
}, true);

document.addEventListener('click', (e)=>{
  if(!contextMenu.contains(e.target)){
    hideContextMenu();
  }
});

async function saveShape(rect){
  const id = rect.objId;
  // ensure width/height reflect transforms
  normalizeRect(rect);
  const obj = {
    type: rect.objType || 'house',
    label: rect.label || '',
    x: Math.round(rect.x()), y: Math.round(rect.y()), width: Math.round(rect.width()), height: Math.round(rect.height()),
    status: rect.status || 'non_customer', meta: rect.meta || {}
  };
  if(id){
    await api.update(id, obj);
  } else {
    const res = await api.create(obj);
    rect.objId = res.id;
  }
}

document.getElementById('add-house').addEventListener('click', async ()=>{
  const p = stage.getPointerPosition() || { x: 50, y: 50 };
  const obj = { type: 'house', label:'', x: Math.round(p.x), y: Math.round(p.y), width: 50, height: 40, status: 'non_customer', meta: {} };
  const res = await api.create(obj);
  obj.id = res.id;
  const rect = createRectFromObj(obj);
  rect.objId = obj.id;
  layer.draw();
});

// editor logic
let selectedShape = null;
let customers = [];
const editor = document.getElementById('editor');
const fldType = document.getElementById('obj-type');
const fldLabel = document.getElementById('obj-label');
const fldStatus = document.getElementById('obj-status');
const fldWidth = document.getElementById('obj-width');
const fldHeight = document.getElementById('obj-height');
const fldCustSelect = document.getElementById('cust-select');
const fldCustName = document.getElementById('cust-name');
const fldCustPhone = document.getElementById('cust-phone');
const btnSave = document.getElementById('save-btn');
const btnDelete = document.getElementById('delete-btn');
const btnClose = document.getElementById('close-btn');

// Load customers from CSV
async function loadCustomers(){
  try {
    customers = await fetch('/api/customers').then(r => r.json());
    // Populate customer select dropdown
    customers.forEach(cust => {
      const option = document.createElement('option');
      option.value = cust.id;
      option.textContent = `${cust.name} (${cust.phone})`;
      fldCustSelect.appendChild(option);
    });
  } catch(e) {
    console.error('Failed to load customers:', e);
  }
}

// Handle customer selection
fldCustSelect.addEventListener('change', ()=>{
  const selectedId = fldCustSelect.value;
  if(selectedId){
    const cust = customers.find(c => c.id === selectedId);
    if(cust){
      fldCustName.value = cust.name || '';
      fldCustPhone.value = cust.phone || '';
    }
  } else {
    fldCustName.value = '';
    fldCustPhone.value = '';
  }
});

loadCustomers();

// Context Menu Functions
let contextMenuShape = null;
let previousCustomer = null;

const contextMenu = document.getElementById('context-menu');

function showContextMenu(x, y, rect){
  console.log('showContextMenu called with:', x, y);
  contextMenuShape = rect;
  
  // Set position first
  contextMenu.style.left = (x) + 'px';
  contextMenu.style.top = (y) + 'px';
  
  // Show the menu
  contextMenu.classList.remove('hidden');
  
  // Get menu dimensions
  setTimeout(()=>{
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    console.log('Menu dimensions:', menuWidth, menuHeight, 'Viewport:', viewportWidth, viewportHeight);
    
    // Adjust position if menu goes off screen
    let finalX = x;
    let finalY = y;
    
    // Check if menu goes off right edge
    if(finalX + menuWidth > viewportWidth){
      finalX = viewportWidth - menuWidth - 10;
    }
    
    // Check if menu goes off bottom edge
    if(finalY + menuHeight > viewportHeight){
      finalY = viewportHeight - menuHeight - 10;
    }
    
    // Ensure minimum position
    finalX = Math.max(5, finalX);
    finalY = Math.max(5, finalY);
    
    console.log('Final position:', finalX, finalY);
    
    contextMenu.style.left = finalX + 'px';
    contextMenu.style.top = finalY + 'px';
  }, 10);
}

function hideContextMenu(){
  contextMenu.classList.add('hidden');
  contextMenuShape = null;
}

function showEditorFor(rect){
  if(!rect) return;
  editor.classList.remove('hidden');
  fldType.value = rect.objType || 'house';
  fldLabel.value = rect.label || '';
  fldStatus.value = rect.status || 'non_customer';
  fldWidth.value = Math.round(rect.width()) || 50;
  fldHeight.value = Math.round(rect.height()) || 40;
  const meta = rect.meta || {};
  fldCustName.value = meta.name || '';
  fldCustPhone.value = meta.phone || '';
  // Try to find and select customer by ID
  const custId = meta.custId || '';
  fldCustSelect.value = custId;
}

function hideEditor(){
  editor.classList.add('hidden');
  selectedShape = null;
  transformer.nodes([]);
}

btnClose.addEventListener('click', ()=>{ hideEditor(); layer.draw(); });

btnDelete.addEventListener('click', async ()=>{
  if(!selectedShape) return;
  if(selectedShape.objId) await api.delete(selectedShape.objId);
  if(selectedShape._label) selectedShape._label.destroy();
  selectedShape.destroy();
  hideEditor();
  layer.draw();
});

btnSave.addEventListener('click', async ()=>{
  if(!selectedShape) return;
  selectedShape.objType = fldType.value;
  selectedShape.label = fldLabel.value;
  selectedShape._label.text(selectedShape.label);
  selectedShape.status = fldStatus.value;
  selectedShape.fill(makeFill(selectedShape.status));
  // Update dimensions
  const newWidth = parseInt(fldWidth.value) || 50;
  const newHeight = parseInt(fldHeight.value) || 40;
  selectedShape.width(newWidth);
  selectedShape.height(newHeight);
  normalizeRect(selectedShape);
  updateLabelPos(selectedShape);
  selectedShape.meta = { custId: fldCustSelect.value, name: fldCustName.value, phone: fldCustPhone.value };
  await saveShape(selectedShape);
  layer.draw();
});

// deselect on background click
stage.on('click', function(e){
  if(e.target === stage || e.target === layer.findOne('Image')){
    hideEditor();
    layer.draw();
  }
});

// delete selected with Delete key
window.addEventListener('keydown', async (e)=>{
  if(e.key === 'Delete'){
    const nodes = transformer.nodes();
    if(nodes.length){
      const node = nodes[0];
      if(node.objId){
        await api.delete(node.objId);
      }
      node._label.destroy();
      node.destroy();
      transformer.nodes([]);
      layer.draw();
    }
  }
});

// keep labels positioned when shapes move
layer.on('dragmove', function(){
  layer.find('Rect').forEach(r=>{ if(r._label) updateLabelPos(r); });
});

function updateLabelPos(r){ if(r._label) { r._label.x(r.x()); r._label.y(r.y()-16); } }

function normalizeRect(rect){
  const scaleX = rect.scaleX() || 1;
  const scaleY = rect.scaleY() || 1;
  if(scaleX !== 1 || scaleY !== 1){
    rect.width(rect.width() * scaleX);
    rect.height(rect.height() * scaleY);
    rect.scaleX(1);
    rect.scaleY(1);
  }
}
