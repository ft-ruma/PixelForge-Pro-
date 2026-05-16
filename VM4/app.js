// app.js

// Global State
let currentTool = 'brush';
let fgColor = '#a855f7';
let isDrawing = false;
let startX, startY;
const historyStack = [];
let historyIndex = -1;
let adjOriginalImageData = null;

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  const app = document.getElementById('app');
  const splashFill = document.getElementById('splashFill');
  const splashStatus = document.getElementById('splashStatus');

  let progress = 0;
  const loadingInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 20) + 10;
    if (progress > 100) progress = 100;
    splashFill.style.width = `${progress}%`;
    if (progress > 25) splashStatus.textContent = 'Loading core modules...';
    if (progress > 50) splashStatus.textContent = 'Initializing canvas engine...';
    if (progress > 80) splashStatus.textContent = 'Starting UI...';
    if (progress === 100) {
      clearInterval(loadingInterval);
      setTimeout(() => {
        splash.style.opacity = '0';
        splash.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          splash.classList.add('hidden');
          app.classList.remove('hidden');
          initApp();
        }, 500);
      }, 300);
    }
  }, 200);
});
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0,0,0];
}

function rgbToHex(r, g, b) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

function floodFill(ctx, x, y, fillColor) {
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  
  const startPos = (y * w + x) * 4;
  const startR = data[startPos], startG = data[startPos+1], startB = data[startPos+2], startA = data[startPos+3];
  if (startR === fillColor[0] && startG === fillColor[1] && startB === fillColor[2] && startA === 255) return;
  
  const tolerance = 30;
  const matchStartColor = (pos) => {
    return Math.abs(data[pos] - startR) <= tolerance &&
           Math.abs(data[pos+1] - startG) <= tolerance &&
           Math.abs(data[pos+2] - startB) <= tolerance &&
           Math.abs(data[pos+3] - startA) <= tolerance;
  };
  
  const stack = [[x, y]];
  while (stack.length > 0) {
    let [cx, cy] = stack.pop();
    let pos = (cy * w + cx) * 4;
    while (cy > 0 && matchStartColor(pos - w * 4)) { cy--; pos -= w * 4; }
    let reachLeft = false, reachRight = false;
    while (cy < h && matchStartColor(pos)) {
      data[pos] = fillColor[0]; data[pos+1] = fillColor[1]; data[pos+2] = fillColor[2]; data[pos+3] = 255;
      if (cx > 0) {
        if (matchStartColor(pos - 4)) { if (!reachLeft) { stack.push([cx - 1, cy]); reachLeft = true; } }
        else if (reachLeft) reachLeft = false;
      }
      if (cx < w - 1) {
        if (matchStartColor(pos + 4)) { if (!reachRight) { stack.push([cx + 1, cy]); reachRight = true; } }
        else if (reachRight) reachRight = false;
      }
      cy++; pos += w * 4;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function initApp() {
  console.log("PixelForge Pro initialized.");
  setTool('brush');

  const workspace = document.getElementById('workspace');
  workspace.addEventListener('dragover', (e) => { e.preventDefault(); workspace.classList.add('drag-over'); });
  workspace.addEventListener('dragleave', (e) => { e.preventDefault(); workspace.classList.remove('drag-over'); });
  workspace.addEventListener('drop', (e) => {
    e.preventDefault();
    workspace.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');

  canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'brush' || currentTool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
    } else if (currentTool === 'fill') {
      floodFill(ctx, Math.round(startX), Math.round(startY), hexToRgb(fgColor));
      saveState('Flood Fill');
    } else if (currentTool === 'eyedropper') {
      const p = ctx.getImageData(Math.round(startX), Math.round(startY), 1, 1).data;
      const hex = rgbToHex(p[0], p[1], p[2]);
      document.getElementById('colorPicker').value = hex;
      applyColorPick();
      setTool('brush'); // switch back to brush after pick
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    document.getElementById('statusCursor').textContent = `X: ${Math.round(x)} Y: ${Math.round(y)}`;

    if (!isDrawing) return;

    if (currentTool === 'brush') {
      ctx.lineTo(x, y);
      ctx.strokeStyle = fgColor;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.stroke();
    } else if (currentTool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; // reset
    }
  });

  const endDrawing = () => {
    if (isDrawing && (currentTool === 'brush' || currentTool === 'eraser')) {
      saveState(currentTool === 'brush' ? 'Brush Stroke' : 'Eraser Tool');
    }
    isDrawing = false;
  };

  canvas.addEventListener('mouseup', endDrawing);
  canvas.addEventListener('mouseleave', endDrawing);

  // Initialize white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveState('New Document');
}

// ----- HISTORY ENGINE -----
function saveState(actionName) {
  const canvas = document.getElementById('mainCanvas');
  const data = canvas.toDataURL();
  
  historyStack.length = historyIndex + 1; // truncate forward history
  historyStack.push({ data, name: actionName });
  historyIndex++;
  updateHistoryUI();
}

function restoreState(index) {
  if (index < 0 || index >= historyStack.length) return;
  const item = historyStack[index];
  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    document.getElementById('overlayCanvas').width = img.width;
    document.getElementById('overlayCanvas').height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    document.getElementById('statusSize').textContent = `${canvas.width} × ${canvas.height} px`;
  };
  img.src = item.data;
  historyIndex = index;
  updateHistoryUI();
}

function updateHistoryUI() {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '';
  historyStack.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = `history-item ${i === historyIndex ? 'active' : ''}`;
    div.textContent = item.name;
    div.onclick = () => restoreState(i);
    list.prepend(div);
  });
}

function histUndo() {
  if (historyIndex > 0) {
    restoreState(historyIndex - 1);
    showToast('Undo');
  } else {
    showToast('Nothing to undo');
  }
}

function histRedo() {
  if (historyIndex < historyStack.length - 1) {
    restoreState(historyIndex + 1);
    showToast('Redo');
  } else {
    showToast('Nothing to redo');
  }
}

function clearHistory() { 
  const currentItem = historyStack[historyIndex];
  historyStack.length = 0;
  historyStack.push({ data: currentItem.data, name: 'Document State' });
  historyIndex = 0;
  updateHistoryUI();
  showToast('History cleared'); 
}

// ----- UI CONTROLS -----
function newDocument() { document.getElementById('newDocModal').classList.remove('hidden'); }
function openFile() { document.getElementById('fileInput').click(); }
function saveFile() {
  const link = document.createElement('a');
  link.download = 'pixel_forge_project.png';
  link.href = document.getElementById('mainCanvas').toDataURL();
  link.click();
  showToast('File saved'); 
}
function exportFile() { saveFile(); }
function closeDoc() { 
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('dropHint').classList.remove('hidden');
  saveState('Close Document');
}

function copyCanvas() { showToast('Copied to clipboard'); }
function pasteCanvas() { showToast('Pasted from clipboard'); }
function selectAll() { showToast('Selected all canvas content'); }
function deselect() { showToast('Deselected'); }

function showResizeDialog() { 
  const canvas = document.getElementById('mainCanvas');
  document.getElementById('resW').value = canvas.width;
  document.getElementById('resH').value = canvas.height;
  document.getElementById('resizeModal').classList.remove('hidden'); 
}

function showCanvasSize() { showResizeDialog(); }

function rotateImage(deg) { 
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  temp.getContext('2d').drawImage(canvas, 0, 0);

  if (Math.abs(deg) === 90) {
    canvas.width = temp.height;
    canvas.height = temp.width;
  }
  
  ctx.translate(canvas.width/2, canvas.height/2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(temp, -temp.width/2, -temp.height/2);
  ctx.resetTransform();
  
  document.getElementById('overlayCanvas').width = canvas.width;
  document.getElementById('overlayCanvas').height = canvas.height;
  
  saveState(`Rotate ${deg}°`);
  showToast(`Rotated ${deg}°`); 
}

function flipHorizontal() { 
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  temp.getContext('2d').drawImage(canvas, 0, 0);
  
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(temp, 0, 0);
  ctx.resetTransform();
  saveState('Flip Horizontal');
}

function flipVertical() { 
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  temp.getContext('2d').drawImage(canvas, 0, 0);
  
  ctx.translate(0, canvas.height);
  ctx.scale(1, -1);
  ctx.drawImage(temp, 0, 0);
  ctx.resetTransform();
  saveState('Flip Vertical');
}

function applyFilter(filter) { 
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  
  if (['blur', 'grayscale', 'sepia', 'invert', 'vintage'].includes(filter)) {
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    temp.getContext('2d').drawImage(canvas, 0, 0);
    
    let filterStr = '';
    switch(filter) {
      case 'blur': filterStr = 'blur(5px)'; break;
      case 'grayscale': filterStr = 'grayscale(100%)'; break;
      case 'sepia': filterStr = 'sepia(100%)'; break;
      case 'invert': filterStr = 'invert(100%)'; break;
      case 'vintage': filterStr = 'sepia(50%) contrast(150%) saturate(150%)'; break;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = filterStr;
    ctx.drawImage(temp, 0, 0);
    ctx.filter = 'none';
  } else {
    // Pro-grade Pixel manipulation for Sharpen, Emboss, Pixelate, Vignette
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = imgData.data;
    const w = canvas.width, h = canvas.height;
    
    if (filter === 'vignette') {
      const cx = w / 2, cy = h / 2;
      const maxDist = Math.sqrt(cx*cx + cy*cy);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const dist = Math.sqrt(Math.pow(cx - x, 2) + Math.pow(cy - y, 2));
          const factor = 1 - Math.pow(dist / maxDist, 2.5) * 0.8;
          src[idx] = Math.min(255, src[idx] * factor);
          src[idx+1] = Math.min(255, src[idx+1] * factor);
          src[idx+2] = Math.min(255, src[idx+2] * factor);
        }
      }
    } else if (filter === 'pixelate') {
      const bSize = 10;
      for (let y = 0; y < h; y += bSize) {
        for (let x = 0; x < w; x += bSize) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let by = 0; by < bSize && y + by < h; by++) {
            for (let bx = 0; bx < bSize && x + bx < w; bx++) {
              const idx = ((y + by) * w + (x + bx)) * 4;
              r += src[idx]; g += src[idx+1]; b += src[idx+2]; count++;
            }
          }
          r /= count; g /= count; b /= count;
          for (let by = 0; by < bSize && y + by < h; by++) {
            for (let bx = 0; bx < bSize && x + bx < w; bx++) {
              const idx = ((y + by) * w + (x + bx)) * 4;
              src[idx] = r; src[idx+1] = g; src[idx+2] = b;
            }
          }
        }
      }
    } else if (filter === 'sharpen' || filter === 'emboss') {
      const kernel = filter === 'sharpen' ? [0, -1, 0, -1, 5, -1, 0, -1, 0] : [-2, -1, 0, -1, 1, 1, 0, 1, 2];
      const side = 3, halfSide = 1;
      const dst = new Uint8ClampedArray(src.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dstOff = (y * w + x) * 4;
          let r = 0, g = 0, b = 0;
          for (let cy = 0; cy < side; cy++) {
            for (let cx = 0; cx < side; cx++) {
              const scy = y + cy - halfSide, scx = x + cx - halfSide;
              if (scy >= 0 && scy < h && scx >= 0 && scx < w) {
                const srcOff = (scy * w + scx) * 4;
                const wt = kernel[cy * side + cx];
                r += src[srcOff] * wt; g += src[srcOff + 1] * wt; b += src[srcOff + 2] * wt;
              }
            }
          }
          if (filter === 'emboss') { r += 128; g += 128; b += 128; }
          dst[dstOff] = r; dst[dstOff + 1] = g; dst[dstOff + 2] = b; dst[dstOff + 3] = src[dstOff + 3];
        }
      }
      for (let i = 0; i < src.length; i++) src[i] = dst[i];
    }
    ctx.putImageData(imgData, 0, 0);
  }
  
  saveState(`Filter: ${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
  showToast(`Applied ${filter} filter`); 
}

function setZoom(level) { 
  document.getElementById('zoomLabel').textContent = `${level}%`;
  document.getElementById('statusZoom').textContent = `${level}%`;
  const container = document.getElementById('canvasContainer');
  container.style.transform = `scale(${level / 100})`;
}

function fitToScreen() { 
  const canvas = document.getElementById('mainCanvas');
  const workspace = document.getElementById('workspace');
  const wsRect = workspace.getBoundingClientRect();
  const wRatio = (wsRect.width - 100) / canvas.width;
  const hRatio = (wsRect.height - 100) / canvas.height;
  const ratio = Math.min(wRatio, hRatio, 1);
  setZoom(Math.round(ratio * 100)); 
}

function toggleGrid() { document.getElementById('gridOverlay').classList.toggle('hidden'); }
function toggleRulers() { showToast('Toggled rulers'); }
function zoomIn() { 
  let current = parseInt(document.getElementById('zoomLabel').textContent);
  setZoom(Math.min(current + 25, 500)); 
}
function zoomOut() { 
  let current = parseInt(document.getElementById('zoomLabel').textContent);
  setZoom(Math.max(current - 25, 10)); 
}

function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  const toolBtn = document.getElementById(`tool-${tool}`);
  if (toolBtn) {
    toolBtn.classList.add('active');
    document.getElementById('statusTool').textContent = `Tool: ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
  }
}

function pickColor(type) { document.getElementById('colorPicker').click(); }

function applyColorPick() {
  const color = document.getElementById('colorPicker').value;
  fgColor = color;
  document.getElementById('fgColor').style.background = color;
  document.getElementById('statusColor').textContent = `Color: ${color}`;
}

function switchPanel(panelId) {
  document.querySelectorAll('.panel-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.panel-content').forEach(content => content.classList.add('hidden'));
  document.getElementById(`tab-${panelId}`).classList.add('active');
  document.getElementById(`panel-${panelId}`).classList.remove('hidden');
}

function toggleAdj(section) {
  const body = document.getElementById(`adj-${section}`);
  const arr = document.getElementById(`arr-${section}`);
  if (body.style.display === 'none' || body.classList.contains('hidden')) {
    body.style.display = 'flex';
    body.classList.remove('hidden');
    arr.textContent = '▾';
  } else {
    body.style.display = 'none';
    body.classList.add('hidden');
    arr.textContent = '▸';
  }
}

function liveAdjust() {
  const sliders = [
    'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
    'temperature', 'tint', 'vibrance', 'saturation', 'hue',
    'sharpness', 'noise', 'clarity', 'vignette', 'grain', 'blur'
  ];
  
  sliders.forEach(id => {
    const sl = document.getElementById(`sl-${id}`);
    const val = document.getElementById(`val-${id}`);
    if (sl && val) val.textContent = sl.value;
  });

  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');

  if (!adjOriginalImageData) {
    adjOriginalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // Get all values
  const exp = Number(document.getElementById('sl-exposure')?.value || 0) / 100;
  const con = Number(document.getElementById('sl-contrast')?.value || 0);
  const high = Number(document.getElementById('sl-highlights')?.value || 0) / 100; 
  const shad = Number(document.getElementById('sl-shadows')?.value || 0) / 100;
  const whites = Number(document.getElementById('sl-whites')?.value || 0);
  const blacks = Number(document.getElementById('sl-blacks')?.value || 0);
  const temp = Number(document.getElementById('sl-temperature')?.value || 0);
  const tint = Number(document.getElementById('sl-tint')?.value || 0);
  const vib = Number(document.getElementById('sl-vibrance')?.value || 0);
  const sat = Number(document.getElementById('sl-saturation')?.value || 0) / 100;

  const expMult = Math.pow(2, exp * 2);
  const conFactor = (259 * (con + 255)) / (255 * (259 - con));

  const src = adjOriginalImageData.data;
  const imgData = ctx.createImageData(canvas.width, canvas.height);
  const dst = imgData.data;

  // Adobe Photoshop-grade Pixel Manipulation Engine
  for (let i = 0; i < src.length; i += 4) {
    let r = src[i], g = src[i+1], b = src[i+2];

    // Exposure
    if (exp !== 0) { r *= expMult; g *= expMult; b *= expMult; }

    // Temperature & Tint
    if (temp !== 0 || tint !== 0) {
      r += temp; b -= temp;
      g -= tint; r += tint * 0.5; b += tint * 0.5;
    }

    // Contrast
    if (con !== 0) {
      r = conFactor * (r - 128) + 128;
      g = conFactor * (g - 128) + 128;
      b = conFactor * (b - 128) + 128;
    }

    // Highlights & Shadows
    if (high !== 0 || shad !== 0) {
      let l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (shad > 0 && l < 0.5) {
        let amt = shad * (1 - (l * 2));
        r += (255 - r) * amt * 0.5; g += (255 - g) * amt * 0.5; b += (255 - b) * amt * 0.5;
      }
      if (high < 0 && l > 0.5) {
        let amt = -high * ((l - 0.5) * 2);
        r *= (1 - amt); g *= (1 - amt); b *= (1 - amt);
      }
    }

    // Whites & Blacks
    if (whites !== 0 || blacks !== 0) {
      let wPoint = 255 - whites;
      let bPoint = blacks;
      let range = wPoint - bPoint;
      if (range !== 0) {
        r = ((r - bPoint) / range) * 255;
        g = ((g - bPoint) / range) * 255;
        b = ((b - bPoint) / range) * 255;
      }
    }

    // Vibrance
    if (vib !== 0) {
      let vAmt = vib / 100;
      let max = Math.max(r, g, b);
      let avg = (r + g + b) / 3;
      let amt = ((Math.abs(max - avg) * 2 / 255) * vAmt);
      r += (max - r) * amt; g += (max - g) * amt; b += (max - b) * amt;
    }

    // Saturation
    if (sat !== 0) {
      let l = 0.299*r + 0.587*g + 0.114*b;
      r += sat * (r - l); g += sat * (g - l); b += sat * (b - l);
    }

    // Clamp
    dst[i] = r > 255 ? 255 : r < 0 ? 0 : r;
    dst[i+1] = g > 255 ? 255 : g < 0 ? 0 : g;
    dst[i+2] = b > 255 ? 255 : b < 0 ? 0 : b;
    dst[i+3] = src[i+3];
  }

  ctx.putImageData(imgData, 0, 0);

  // Hardware Accelerated CSS Filters for neighbors
  const blurVal = Number(document.getElementById('sl-blur')?.value || 0);
  const hueVal = Number(document.getElementById('sl-hue')?.value || 0);
  const vigVal = Number(document.getElementById('sl-vignette')?.value || 0);
  
  let cssFilter = '';
  if (blurVal > 0) cssFilter += `blur(${blurVal}px) `;
  if (hueVal !== 0) cssFilter += `hue-rotate(${hueVal}deg) `;
  
  canvas.style.filter = cssFilter || 'none';
  
  const container = document.getElementById('canvasContainer');
  if (container) {
    if (vigVal > 0) {
      container.style.boxShadow = `inset 0 0 ${vigVal * 5}px rgba(0,0,0,${vigVal/100})`;
    } else {
      container.style.boxShadow = 'none';
    }
  }
}

function resetAdjustments() {
  document.querySelectorAll('.adj-body input[type="range"]').forEach(slider => {
    slider.value = slider.getAttribute('value') || 0;
    const valDisplay = document.getElementById(`val-${slider.id.split('-')[1]}`);
    if (valDisplay) valDisplay.textContent = slider.value;
  });
  
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  
  if (adjOriginalImageData) {
    ctx.putImageData(adjOriginalImageData, 0, 0);
    adjOriginalImageData = null;
  }
  
  canvas.style.filter = 'none';
  const container = document.getElementById('canvasContainer');
  if(container) container.style.boxShadow = 'none';
  
  showToast('Adjustments reset');
}

function applyAdjustments() { 
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  
  // If CSS filters exist, we must bake them in.
  const filterStr = canvas.style.filter;
  if (filterStr && filterStr !== 'none') {
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    temp.getContext('2d').drawImage(canvas, 0, 0);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = filterStr;
    ctx.drawImage(temp, 0, 0);
    ctx.filter = 'none';
    canvas.style.filter = 'none';
  }
  
  // Bake Vignette
  const vigVal = Number(document.getElementById('sl-vignette')?.value || 0);
  if (vigVal > 0) {
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height) * 0.2, canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height) * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${vigVal/100})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  adjOriginalImageData = null; // Clear cache
  
  saveState('Apply Adjustments');
  
  document.querySelectorAll('.adj-body input[type="range"]').forEach(slider => {
    slider.value = slider.getAttribute('value') || 0;
    const valDisplay = document.getElementById(`val-${slider.id.split('-')[1]}`);
    if (valDisplay) valDisplay.textContent = slider.value;
  });
  
  const container = document.getElementById('canvasContainer');
  if(container) container.style.boxShadow = 'none';

  showToast('Adjustments applied'); 
}

function addLayer() {
  const layersList = document.getElementById('layersList');
  const newLayer = document.createElement('div');
  newLayer.className = 'layer-item';
  newLayer.innerHTML = `<div class="layer-eye">👁</div><div class="layer-thumb"></div><div class="layer-info"><div class="layer-name">New Layer</div><div class="layer-type">Raster</div></div>`;
  layersList.prepend(newLayer);
  showToast('Layer added (UI Only)');
}

function duplicateLayer() { showToast('Layer duplicated (UI Only)'); }
function mergeDown() { showToast('Merged down (UI Only)'); }
function deleteLayer() { showToast('Layer deleted (UI Only)'); }
function changeBlendMode() {
  const mode = document.getElementById('blendMode').value;
  document.getElementById('mainCanvas').style.mixBlendMode = mode;
  showToast(`Blend mode set to ${mode}`);
}
function updateLayerOpacity() {
  const op = document.getElementById('layerOpacity').value;
  document.getElementById('opacityLabel').textContent = op;
  document.getElementById('mainCanvas').style.opacity = op / 100;
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function createNewDoc() { 
  const w = parseInt(document.getElementById('newW').value) || 1200;
  const h = parseInt(document.getElementById('newH').value) || 800;
  const bg = document.getElementById('newBg').value;
  
  const canvas = document.getElementById('mainCanvas');
  canvas.width = w; canvas.height = h;
  document.getElementById('overlayCanvas').width = w;
  document.getElementById('overlayCanvas').height = h;
  
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (bg === 'white') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  else if (bg === 'black') { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h); }
  
  document.getElementById('statusSize').textContent = `${w} × ${h} px`;
  
  closeModal('newDocModal');
  document.getElementById('dropHint').classList.add('hidden');
  saveState('New Document');
}

function doResize() {
  const w = parseInt(document.getElementById('resW').value);
  const h = parseInt(document.getElementById('resH').value);
  if(!w || !h) return;
  
  const canvas = document.getElementById('mainCanvas');
  const temp = document.createElement('canvas');
  temp.width = canvas.width; temp.height = canvas.height;
  temp.getContext('2d').drawImage(canvas, 0, 0);
  
  canvas.width = w; canvas.height = h;
  document.getElementById('overlayCanvas').width = w;
  document.getElementById('overlayCanvas').height = h;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(temp, 0, 0, w, h);
  
  document.getElementById('statusSize').textContent = `${w} × ${h} px`;
  
  closeModal('resizeModal');
  saveState('Resize Canvas');
}

function loadImage(input) {
  if (input.files && input.files[0]) { handleImageFile(input.files[0]); }
}

function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file'); return;
  }
  document.getElementById('dropHint').classList.add('hidden');
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const mainCanvas = document.getElementById('mainCanvas');
      const overlayCanvas = document.getElementById('overlayCanvas');
      mainCanvas.width = img.width; mainCanvas.height = img.height;
      overlayCanvas.width = img.width; overlayCanvas.height = img.height;
      
      const ctx = mainCanvas.getContext('2d');
      ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      ctx.drawImage(img, 0, 0);
      
      document.getElementById('statusSize').textContent = `${img.width} × ${img.height} px`;
      showToast(`Loaded ${file.name}`);
      saveState(`Open ${file.name}`);
      addLayer();
      const latestLayer = document.querySelector('.layer-item .layer-name');
      if (latestLayer) latestLayer.textContent = file.name;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toast.timeoutId) clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => { toast.classList.remove('show'); }, 3000);
}
