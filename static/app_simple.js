// Simple house editor - just add, delete, move, edit

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

// Load background image
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
  alt.onerror = () => { loadObjects(); };
  alt.src = '/static/map.jpg';
};
bgImage.src = '/static/map.png';

const transformer = new Konva.Transformer({ 
  rotateEnabled: false, 
  enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'],
  borderStroke: '#007bff',
  borderStrokeWidth: 2,
  anchorStroke: '#007bff',
  anchorStrokeWidth: 2,
  anchorSize: 10,
  anchorCornerRadius: 3
});
layer.add(transformer);

let selectedShape = null;
let clickTimeout = null;

// Create rectangle from object
function createRectFromObj(obj){
  const rect = new Konva.Rect({
    x: obj.x, y: obj.y, width: obj.width, height: obj.height,
    fill: '#ff6b6b', opacity: 0.6, stroke: '#333', strokeWidth: 1, draggable: true
  });
  rect.objId = obj.id;
  rect.label = obj.label || '';
  
  // Label text
  const text = new Konva.Text({ 
    x: obj.x, y: obj.y - 16, text: rect.label, fontSize: 12, fill: '#000' 
  });
  rect._label = text;
  layer.add(rect);
  layer.add(text);

  // Update label position on drag
  rect.on('dragend', ()=> { 
    updateLabelPos(rect); 
    saveShape(rect); 
  });

  // Update on resize
  rect.on('transformend', ()=> { 
    normalizeRect(rect); 
    updateLabelPos(rect); 
    saveShape(rect); 
  });

  // Click to select and edit - with double-click detection
  rect.on('click', ()=>{
    if(clickTimeout) clearTimeout(clickTimeout);
    clickTimeout = setTimeout(() => {
      selectedShape = rect;
      transformer.nodes([rect]);
      showEditor(rect);
      layer.draw();
    }, 300);
  });

  // Double-click to delete
  rect.on('dblclick', async ()=>{
    if(clickTimeout) clearTimeout(clickTimeout);
    console.log('Double-clicked, deleting:', rect.objId);
    if(rect.objId) await api.delete(rect.objId);
    if(rect._label) rect._label.destroy();
    rect.destroy();
    hideEditor();
    layer.draw();
  });

  rect.on('mouseover', ()=> stage.container().style.cursor = 'move');
  rect.on('mouseout', ()=> stage.container().style.cursor = 'default');

  // Right-click to select for resizing (without opening editor)
  rect.on('contextmenu', (e)=>{
    e.evt.preventDefault();
    selectedShape = rect;
    transformer.nodes([rect]);
    layer.draw();
  });

  return rect;
}

// Load all objects from server
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

// Save shape to server
async function saveShape(rect){
  const id = rect.objId;
  normalizeRect(rect);
  const obj = {
    type: 'house',
    label: rect.label || '',
    x: Math.round(rect.x()), 
    y: Math.round(rect.y()), 
    width: Math.round(rect.width()), 
    height: Math.round(rect.height()),
    status: 'non_customer', 
    meta: {}
  };
  if(id){
    await api.update(id, obj);
  } else {
    const res = await api.create(obj);
    rect.objId = res.id;
  }
}

// Add new house button
document.getElementById('add-house').addEventListener('click', async ()=>{
  const p = stage.getPointerPosition() || { x: 50, y: 50 };
  const obj = { type: 'house', label:'', x: Math.round(p.x), y: Math.round(p.y), width: 50, height: 40, status: 'non_customer', meta: {} };
  const res = await api.create(obj);
  obj.id = res.id;
  const rect = createRectFromObj(obj);
  rect.objId = obj.id;
  layer.draw();
});

// Editor UI
const editor = document.getElementById('editor');
const fldLabel = document.getElementById('obj-label');
const fldWidth = document.getElementById('obj-width');
const fldHeight = document.getElementById('obj-height');
const btnSave = document.getElementById('save-btn');
const btnDelete = document.getElementById('delete-btn');
const btnClose = document.getElementById('close-btn');

console.log('Button elements:', {btnSave, btnDelete, btnClose});

// Show editor
function showEditor(rect){
  editor.style.position = 'fixed';
  editor.style.top = '50%';
  editor.style.left = '50%';
  editor.style.transform = 'translate(-50%, -50%)';
  
  editor.classList.remove('hidden');
  fldLabel.value = rect.label || '';
  fldWidth.value = Math.round(rect.width());
  fldHeight.value = Math.round(rect.height());
}

// Hide editor
function hideEditor(){
  editor.classList.add('hidden');
  selectedShape = null;
  transformer.nodes([]);
}

// Make editor draggable
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

editor.addEventListener('mousedown', (e)=>{
  if(e.target === editor || e.target === editor.querySelector('h3')){
    isDragging = true;
    dragOffsetX = e.clientX - editor.offsetLeft;
    dragOffsetY = e.clientY - editor.offsetTop;
  }
});

document.addEventListener('mousemove', (e)=>{
  if(isDragging){
    editor.style.left = (e.clientX - dragOffsetX) + 'px';
    editor.style.top = (e.clientY - dragOffsetY) + 'px';
    editor.style.transform = 'none';
  }
});

document.addEventListener('mouseup', ()=>{
  isDragging = false;
});

btnClose.addEventListener('click', ()=>{ 
  hideEditor(); 
  layer.draw(); 
});

btnDelete.addEventListener('click', async ()=>{
  console.log('Delete button clicked, selectedShape:', selectedShape);
  if(!selectedShape) {
    console.log('No shape selected');
    return;
  }
  console.log('Deleting shape with ID:', selectedShape.objId);
  if(selectedShape.objId) await api.delete(selectedShape.objId);
  if(selectedShape._label) selectedShape._label.destroy();
  selectedShape.destroy();
  hideEditor();
  layer.draw();
  console.log('Shape deleted');
});

btnSave.addEventListener('click', async ()=>{
  if(!selectedShape) return;
  selectedShape.label = fldLabel.value;
  selectedShape._label.text(selectedShape.label);
  selectedShape.width(parseInt(fldWidth.value) || 50);
  selectedShape.height(parseInt(fldHeight.value) || 40);
  normalizeRect(selectedShape);
  updateLabelPos(selectedShape);
  await saveShape(selectedShape);
  hideEditor();
  layer.draw();
});

// Deselect on background click
stage.on('click', function(e){
  if(e.target === stage || e.target === layer.findOne('Image')){
    hideEditor();
    layer.draw();
  }
});

// Delete with Delete key
window.addEventListener('keydown', async (e)=>{
  if(e.key === 'Delete'){
    const nodes = transformer.nodes();
    if(nodes.length){
      const node = nodes[0];
      if(node.objId) await api.delete(node.objId);
      if(node._label) node._label.destroy();
      node.destroy();
      transformer.nodes([]);
      hideEditor();
      layer.draw();
    }
  }
});

// Update label position
function updateLabelPos(r){ 
  if(r._label) { 
    r._label.x(r.x()); 
    r._label.y(r.y()-16); 
  } 
}

// Normalize rect transforms
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

// Keep labels positioned when shapes move
layer.on('dragmove', function(){
  layer.find('Rect').forEach(r=>{ if(r._label) updateLabelPos(r); });
});
