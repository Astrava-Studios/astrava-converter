/**
 * Astrava Converter — Internal Image & Asset Optimization Tool
 * Anything to Anything Resim Dönüştürücü & MB Düşürücü
 * Tamamen tarayıcı içi (Client-Side / Local) çalışır.
 */

const FORMAT_DESCRIPTIONS = {
  'image/webp': 'WebP: Hem şeffaflık destekler hem de yüksek sıkıştırma ile en düşük MB boyutunu sunar.',
  'image/jpeg': 'JPG: Fotoğraflar için evrensel format. Çok iyi boyut düşürür (şeffaflık arka plan rengiyle doldurulur).',
  'image/png': 'PNG: Kayıpsız şeffaf grafik formatı. MB düşürmek için hedef boyut modunda çözünürlük ölçekleme kullanır.',
  'image/avif': 'AVIF: Yeni nesil ultra sıkıştırma formatı. Destekleyen tarayıcılarda en küçük dosya boyutunu üretir.',
  'image/bmp': 'BMP: Sıkıştırmasız 24-bit Windows Bitmap görüntü formatı.',
  'image/x-icon': 'ICO: Web sitesi favicon ve masaüstü ikon formatı (maksimum 256×256 piksele optimize edilir).',
  'image/svg+xml': 'SVG: Görüntüyü vektör kapsayıcı (embedded SVG) içine dönüştürür.',
  'application/pdf': 'PDF: Görüntüyü sıkıştırılmış tek sayfalık PDF belgesine dönüştürür.'
};

const state = {
  files: [],
  targetFormat: 'image/webp',
  targetExt: 'webp',
  compressionMode: 'quality', // 'quality' | 'targetSize'
  quality: 80,
  targetSizeValue: 0.5,
  targetSizeUnit: 'MB',
  autoScaleForTarget: true,
  resizeMode: 'none', // 'none' | 'scale' | 'maxDimensions' | 'exact'
  resizeScale: 50,
  resizeWidth: null,
  resizeHeight: null,
  backgroundColor: '#ffffff'
};

// DOM Elemanları
const dom = {
  formatGrid: document.getElementById('formatGrid'),
  formatDescription: document.getElementById('formatDescription'),
  modeQualityBtn: document.getElementById('modeQualityBtn'),
  modeTargetBtn: document.getElementById('modeTargetBtn'),
  qualityModeBox: document.getElementById('qualityModeBox'),
  targetSizeModeBox: document.getElementById('targetSizeModeBox'),
  qualitySlider: document.getElementById('qualitySlider'),
  qualityValueLabel: document.getElementById('qualityValueLabel'),
  targetSizeInput: document.getElementById('targetSizeInput'),
  targetUnitSelect: document.getElementById('targetUnitSelect'),
  autoScaleCheck: document.getElementById('autoScaleCheck'),
  resizeModeSelect: document.getElementById('resizeModeSelect'),
  resizeScaleBox: document.getElementById('resizeScaleBox'),
  resizeDimensionsBox: document.getElementById('resizeDimensionsBox'),
  scaleSlider: document.getElementById('scaleSlider'),
  scaleValueLabel: document.getElementById('scaleValueLabel'),
  resizeWidthInput: document.getElementById('resizeWidthInput'),
  resizeHeightInput: document.getElementById('resizeHeightInput'),
  bgColorInput: document.getElementById('bgColorInput'),
  bgColorHex: document.getElementById('bgColorHex'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn'),
  convertAllBtn: document.getElementById('convertAllBtn'),
  convertAllBtnText: document.getElementById('convertAllBtnText'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  batchToolbar: document.getElementById('batchToolbar'),
  statCount: document.getElementById('statCount'),
  statOrigTotal: document.getElementById('statOrigTotal'),
  statNewTotal: document.getElementById('statNewTotal'),
  statSavingsBadge: document.getElementById('statSavingsBadge'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  downloadZipBtn: document.getElementById('downloadZipBtn'),
  fileList: document.getElementById('fileList'),
  previewModal: document.getElementById('previewModal'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  modalFileName: document.getElementById('modalFileName'),
  modalFileMeta: document.getElementById('modalFileMeta'),
  modalOrigImg: document.getElementById('modalOrigImg'),
  modalNewImg: document.getElementById('modalNewImg'),
  modalOrigInfo: document.getElementById('modalOrigInfo'),
  modalNewInfo: document.getElementById('modalNewInfo')
};

/* ==========================================
   YARDIMCI FONKSİYONLAR
   ========================================== */

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function getFileExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'img';
}

function getBaseFileName(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function getTargetBytesLimit() {
  const raw = parseFloat(state.targetSizeValue) || 0.5;
  return state.targetSizeUnit === 'MB'
    ? Math.max(1024, Math.round(raw * 1024 * 1024))
    : Math.max(1024, Math.round(raw * 1024));
}

/* ==========================================
   GÖRÜNTÜ ÇÖZÜMLEME (ANYTHING DECODER)
   ========================================== */

async function decodeInputToImage(file) {
  const ext = getFileExtension(file.name);
  let sourceBlob = file;

  // HEIC / HEIF Desteği
  if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
    if (typeof window.heic2any === 'function') {
      const converted = await window.heic2any({
        blob: file,
        toType: 'image/png'
      });
      sourceBlob = Array.isArray(converted) ? converted[0] : converted;
    } else {
      throw new Error('HEIC çözücü kütüphanesi henüz yüklenmedi.');
    }
  }

  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const img = await loadImageFromUrl(objectUrl);
    return {
      img,
      previewUrl: objectUrl,
      width: img.naturalWidth || img.width || 800,
      height: img.naturalHeight || img.height || 600
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Görüntü formatı okunamadı veya dosya bozuk.');
  }
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode error'));
    img.src = url;
  });
}

/* ==========================================
   BOYUTLANDIRMA & CANVAS ÇİZİMİ
   ========================================== */

function calculateTargetDimensions(origW, origH, extraScale = 1) {
  let w = origW;
  let h = origH;

  if (state.resizeMode === 'scale') {
    const ratio = Math.max(0.05, Math.min(1, state.resizeScale / 100));
    w = Math.round(origW * ratio);
    h = Math.round(origH * ratio);
  } else if (state.resizeMode === 'maxDimensions') {
    const maxW = parseInt(state.resizeWidth, 10) || origW;
    const maxH = parseInt(state.resizeHeight, 10) || origH;
    const scale = Math.min(1, maxW / origW, maxH / origH);
    w = Math.round(origW * scale);
    h = Math.round(origH * scale);
  } else if (state.resizeMode === 'exact') {
    const targetW = parseInt(state.resizeWidth, 10);
    const targetH = parseInt(state.resizeHeight, 10);
    if (targetW && targetH) {
      w = targetW;
      h = targetH;
    } else if (targetW) {
      w = targetW;
      h = Math.round((origH / origW) * targetW);
    } else if (targetH) {
      h = targetH;
      w = Math.round((origW / origH) * targetH);
    }
  }

  // ICO için maksimum 256x256 sınırı
  if (state.targetFormat === 'image/x-icon') {
    const icoScale = Math.min(1, 256 / w, 256 / h);
    w = Math.max(16, Math.round(w * icoScale));
    h = Math.max(16, Math.round(h * icoScale));
  }

  w = Math.max(1, Math.round(w * extraScale));
  h = Math.max(1, Math.round(h * extraScale));

  return { width: w, height: h };
}

function renderToCanvas(img, width, height, fillOpaqueBackground) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (fillOpaqueBackground) {
    ctx.fillStyle = state.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, mimeType, qualityFraction) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas çıktısı oluşturulamadı.'));
      },
      mimeType,
      qualityFraction
    );
  });
}

/* ==========================================
   ÖZEL FORMAT KODLAYICILAR (BMP, ICO, SVG, PDF)
   ========================================== */

function encodeCanvasToBmpBlob(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const rowStride = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowStride * height;
  const fileSize = 54 + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BITMAPFILEHEADER (14 byte)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40 byte)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down DIB
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true); // 24-bit RGB
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = 54;
  const padding = rowStride - width * 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      view.setUint8(offset++, imageData[idx + 2]); // Blue
      view.setUint8(offset++, imageData[idx + 1]); // Green
      view.setUint8(offset++, imageData[idx]);     // Red
    }
    for (let p = 0; p < padding; p++) {
      view.setUint8(offset++, 0);
    }
  }

  return new Blob([buffer], { type: 'image/bmp' });
}

async function encodeCanvasToIcoBlob(canvas) {
  const pngBlob = await canvasToBlob(canvas, 'image/png', 1);
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const totalSize = 22 + pngBytes.length;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // ICONDIR (6 byte)
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // 1 = ICO
  view.setUint16(4, 1, true); // 1 Görüntü

  // ICONDIRENTRY (16 byte)
  const w = canvas.width >= 256 ? 0 : canvas.width;
  const h = canvas.height >= 256 ? 0 : canvas.height;
  view.setUint8(6, w);
  view.setUint8(7, h);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, 22, true);

  const outBytes = new Uint8Array(buffer);
  outBytes.set(pngBytes, 22);

  return new Blob([buffer], { type: 'image/x-icon' });
}

async function encodeCanvasToSvgBlob(canvas, qualityFraction) {
  const webpBlob = await canvasToBlob(canvas, 'image/webp', qualityFraction);
  const dataUrl = await blobToDataURL(webpBlob);
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" href="${dataUrl}" />
</svg>`;
  return new Blob([svgContent], { type: 'image/svg+xml' });
}

async function encodeCanvasToPdfBlob(canvas, qualityFraction) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('PDF kütüphanesi henüz yüklenmedi.');
  }
  const { jsPDF } = window.jspdf;
  const orientation = canvas.width >= canvas.height ? 'l' : 'p';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [canvas.width, canvas.height],
    compress: true
  });

  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', qualityFraction);
  const jpegDataUrl = await blobToDataURL(jpegBlob);
  pdf.addImage(jpegDataUrl, 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
  return pdf.output('blob');
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('DataURL dönüşüm hatası'));
    reader.readAsDataURL(blob);
  });
}

/* ==========================================
   ANA DÖNÜŞTÜRÜCÜ & HEDEF MB OPTİMİZASYONU
   ========================================== */

async function encodeWithFormat(img, origW, origH, qualityFraction, extraScale = 1) {
  const { width, height } = calculateTargetDimensions(origW, origH, extraScale);
  const needsOpaqueBg =
    state.targetFormat === 'image/jpeg' ||
    state.targetFormat === 'image/bmp' ||
    state.targetFormat === 'application/pdf';

  const canvas = renderToCanvas(img, width, height, needsOpaqueBg);

  let blob;
  switch (state.targetFormat) {
    case 'image/bmp':
      blob = encodeCanvasToBmpBlob(canvas);
      break;
    case 'image/x-icon':
      blob = await encodeCanvasToIcoBlob(canvas);
      break;
    case 'image/svg+xml':
      blob = await encodeCanvasToSvgBlob(canvas, qualityFraction);
      break;
    case 'application/pdf':
      blob = await encodeCanvasToPdfBlob(canvas, qualityFraction);
      break;
    case 'image/avif': {
      blob = await canvasToBlob(canvas, 'image/avif', qualityFraction);
      // Tarayıcı AVIF encode desteklemiyorsa WebP'ye güvenli geçiş yap
      if (blob.type !== 'image/avif') {
        blob = await canvasToBlob(canvas, 'image/webp', qualityFraction);
      }
      break;
    }
    default:
      blob = await canvasToBlob(canvas, state.targetFormat, qualityFraction);
      break;
  }

  return { blob, width, height };
}

/**
 * Tek bir dosya öğesini mevcut ayarlarla dönüştürür.
 * "Hedef Boyut (MB/KB)" seçiliyse ikili arama (binary search) + ölçek küçültme ile
 * istenen dosya boyutunun altına indirene kadar optimize eder.
 */
async function processSingleItem(item) {
  item.status = 'processing';
  item.errorMsg = null;
  updateFileCardUI(item);

  try {
    if (!item.decodedImg) {
      const decoded = await decodeInputToImage(item.file);
      item.decodedImg = decoded.img;
      item.origPreviewUrl = decoded.previewUrl;
      item.origWidth = decoded.width;
      item.origHeight = decoded.height;
    }

    let result;

    if (state.compressionMode === 'quality') {
      const q = Math.max(0.05, Math.min(1, state.quality / 100));
      result = await encodeWithFormat(item.decodedImg, item.origWidth, item.origHeight, q, 1);
    } else {
      // Hedef MB / KB Modu
      const targetBytes = getTargetBytesLimit();
      result = await compressToTargetBytes(item.decodedImg, item.origWidth, item.origHeight, targetBytes);
    }

    if (item.convertedUrl) {
      URL.revokeObjectURL(item.convertedUrl);
    }

    item.convertedBlob = result.blob;
    item.convertedUrl = URL.createObjectURL(result.blob);
    item.outWidth = result.width;
    item.outHeight = result.height;
    item.outExt = state.targetExt;
    item.status = 'done';
  } catch (err) {
    item.status = 'error';
    item.errorMsg = err.message || 'Dönüştürme başarısız.';
  }

  updateFileCardUI(item);
  updateBatchStats();
}

async function compressToTargetBytes(img, origW, origH, targetBytes) {
  const supportsQuality =
    state.targetFormat === 'image/jpeg' ||
    state.targetFormat === 'image/webp' ||
    state.targetFormat === 'image/avif' ||
    state.targetFormat === 'image/svg+xml' ||
    state.targetFormat === 'application/pdf';

  let bestCandidate = null;

  // 1. Aşama: Orijinal/hedef çözünürlükte kalite araması (Binary Search)
  if (supportsQuality) {
    let low = 0.05;
    let high = 0.96;

    for (let step = 0; step < 6; step++) {
      const mid = (low + high) / 2;
      const attempt = await encodeWithFormat(img, origW, origH, mid, 1);

      if (attempt.blob.size <= targetBytes) {
        bestCandidate = attempt;
        low = mid; // Daha yüksek kalite dene
      } else {
        high = mid; // Boyutu küçültmek için kaliteyi düşür
      }
    }

    if (bestCandidate && bestCandidate.blob.size <= targetBytes) {
      return bestCandidate;
    }

    // En düşük kalitedeki çıktıyı al
    bestCandidate = await encodeWithFormat(img, origW, origH, 0.05, 1);
    if (bestCandidate.blob.size <= targetBytes || !state.autoScaleForTarget) {
      return bestCandidate;
    }
  } else {
    bestCandidate = await encodeWithFormat(img, origW, origH, 0.9, 1);
    if (bestCandidate.blob.size <= targetBytes || !state.autoScaleForTarget) {
      return bestCandidate;
    }
  }

  // 2. Aşama: Çözünürlük ölçekleme ile hedef MB/KB altına inme
  let currentScale = Math.min(0.9, Math.sqrt(targetBytes / bestCandidate.blob.size));
  const minQuality = supportsQuality ? 0.35 : 0.85;

  for (let attemptIdx = 0; attemptIdx < 6; attemptIdx++) {
    currentScale = Math.max(0.08, currentScale);
    const scaledAttempt = await encodeWithFormat(img, origW, origH, minQuality, currentScale);
    bestCandidate = scaledAttempt;

    if (scaledAttempt.blob.size <= targetBytes || currentScale <= 0.08) {
      break;
    }
    currentScale *= 0.78;
  }

  return bestCandidate;
}

/* ==========================================
   DOSYA YÖNETİMİ VE ARAYÜZ GÜNCELLEME
   ========================================== */

async function handleIncomingFiles(fileList) {
  const validFiles = Array.from(fileList).filter((f) => {
    const ext = getFileExtension(f.name);
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'svg', 'ico', 'heic', 'heif', 'tiff', 'tif', 'jfif'];
    return f.type.startsWith('image/') || allowedExts.includes(ext);
  });

  if (validFiles.length === 0) return;

  const newItems = validFiles.map((file) => ({
    id: generateId(),
    file,
    name: file.name,
    origSize: file.size,
    origExt: getFileExtension(file.name),
    origPreviewUrl: null,
    decodedImg: null,
    origWidth: 0,
    origHeight: 0,
    convertedBlob: null,
    convertedUrl: null,
    outWidth: 0,
    outHeight: 0,
    outExt: state.targetExt,
    status: 'pending',
    errorMsg: null
  }));

  state.files.push(...newItems);
  dom.batchToolbar.classList.remove('hidden');
  dom.convertAllBtn.disabled = false;

  newItems.forEach((item) => {
    const cardEl = createFileCardElement(item);
    dom.fileList.appendChild(cardEl);
  });

  updateBatchStats();

  // Yeni eklenen dosyaları otomatik olarak dönüştür
  for (const item of newItems) {
    await processSingleItem(item);
  }
}

function createFileCardElement(item) {
  const card = document.createElement('div');
  card.className = 'file-card';
  card.id = `file-card-${item.id}`;

  card.innerHTML = `
    <div class="file-thumb-wrap" data-action="preview" title="Öncesi / Sonrası Karşılaştır">
      <img class="file-thumb" id="thumb-${item.id}" alt="${item.name}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3C/svg%3E" />
    </div>
    <div class="file-info">
      <div class="file-title-row">
        <span class="file-name" title="${item.name}">${item.name}</span>
        <span class="ext-pill">${item.origExt}</span>
        <span class="arrow-sep">→</span>
        <span class="ext-pill target" id="target-ext-${item.id}">${state.targetExt}</span>
      </div>
      <div class="file-meta-row" id="meta-${item.id}">
        <span>${formatBytes(item.origSize)}</span>
        <span class="status-text processing">Hazırlanıyor...</span>
      </div>
    </div>
    <div class="file-actions">
      <button type="button" class="btn-icon" data-action="preview" title="Karşılaştır / Önizle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
      <button type="button" class="btn-secondary btn-sm" id="dl-btn-${item.id}" data-action="download" disabled>
        İndir
      </button>
      <button type="button" class="btn-icon danger" data-action="remove" title="Listeden Kaldır">
        ✕
      </button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'download') {
      downloadSingleItem(item);
    } else if (action === 'preview') {
      openPreviewModal(item);
    } else if (action === 'remove') {
      removeItem(item.id);
    }
  });

  return card;
}

function updateFileCardUI(item) {
  const thumbEl = document.getElementById(`thumb-${item.id}`);
  const targetExtEl = document.getElementById(`target-ext-${item.id}`);
  const metaEl = document.getElementById(`meta-${item.id}`);
  const dlBtn = document.getElementById(`dl-btn-${item.id}`);

  if (!metaEl) return;

  if (item.origPreviewUrl && thumbEl.src !== item.origPreviewUrl) {
    thumbEl.src = item.origPreviewUrl;
  }

  targetExtEl.textContent = item.outExt || state.targetExt;

  if (item.status === 'processing') {
    dlBtn.disabled = true;
    metaEl.innerHTML = `
      <span>${formatBytes(item.origSize)}</span>
      <span class="status-text processing">Dönüştürülüyor...</span>
    `;
    return;
  }

  if (item.status === 'error') {
    dlBtn.disabled = true;
    metaEl.innerHTML = `
      <span>${formatBytes(item.origSize)}</span>
      <span class="status-text error">${item.errorMsg}</span>
    `;
    return;
  }

  if (item.status === 'done' && item.convertedBlob) {
    dlBtn.disabled = false;
    const newSize = item.convertedBlob.size;
    const diffRatio = ((newSize - item.origSize) / item.origSize) * 100;
    const isSmaller = diffRatio <= 0;
    const badgeText = isSmaller
      ? `${Math.abs(diffRatio).toFixed(1)}% daha küçük`
      : `+${diffRatio.toFixed(1)}%`;

    metaEl.innerHTML = `
      <span>${formatBytes(item.origSize)} <small>(${item.origWidth}×${item.origHeight})</small></span>
      <span class="arrow-sep">→</span>
      <span class="new-size-tag">${formatBytes(newSize)} <small>(${item.outWidth}×${item.outHeight})</small></span>
      <span class="saving-pill ${isSmaller ? 'positive' : 'Negative'}">${badgeText}</span>
    `;
  }
}

function updateBatchStats() {
  const totalCount = state.files.length;
  if (totalCount === 0) {
    dom.batchToolbar.classList.add('hidden');
    dom.convertAllBtn.disabled = true;
    return;
  }

  let origSum = 0;
  let newSum = 0;
  let completedCount = 0;

  state.files.forEach((f) => {
    origSum += f.origSize;
    if (f.status === 'done' && f.convertedBlob) {
      newSum += f.convertedBlob.size;
      completedCount++;
    } else {
      newSum += f.origSize;
    }
  });

  dom.statCount.textContent = String(totalCount);
  dom.statOrigTotal.textContent = formatBytes(origSum);
  dom.statNewTotal.textContent = formatBytes(newSum);

  const savedPercent = origSum > 0 ? Math.max(0, ((origSum - newSum) / origSum) * 100) : 0;
  dom.statSavingsBadge.textContent = `%${savedPercent.toFixed(1)} Kazanç`;
  dom.downloadZipBtn.disabled = completedCount === 0;
}

function removeItem(id) {
  const idx = state.files.findIndex((f) => f.id === id);
  if (idx === -1) return;

  const item = state.files[idx];
  if (item.origPreviewUrl) URL.revokeObjectURL(item.origPreviewUrl);
  if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);

  state.files.splice(idx, 1);
  const cardEl = document.getElementById(`file-card-${id}`);
  if (cardEl) cardEl.remove();

  updateBatchStats();
}

function clearAllItems() {
  state.files.forEach((item) => {
    if (item.origPreviewUrl) URL.revokeObjectURL(item.origPreviewUrl);
    if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
  });
  state.files = [];
  dom.fileList.innerHTML = '';
  updateBatchStats();
}

/* ==========================================
   İNDİRME VE ÖNİZLEME
   ========================================== */

function downloadSingleItem(item) {
  if (!item.convertedBlob || !item.convertedUrl) return;
  const a = document.createElement('a');
  const baseName = getBaseFileName(item.name);
  a.href = item.convertedUrl;
  a.download = `${baseName}.${item.outExt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadAllAsZip() {
  const readyItems = state.files.filter((f) => f.status === 'done' && f.convertedBlob);
  if (readyItems.length === 0) return;

  if (readyItems.length === 1) {
    downloadSingleItem(readyItems[0]);
    return;
  }

  if (typeof window.JSZip !== 'function') {
    readyItems.forEach((item) => downloadSingleItem(item));
    return;
  }

  dom.downloadZipBtn.disabled = true;
  const originalText = dom.downloadZipBtn.innerHTML;
  dom.downloadZipBtn.textContent = 'ZIP Hazırlanıyor...';

  try {
    const zip = new window.JSZip();
    const usedNames = new Set();

    readyItems.forEach((item) => {
      const base = getBaseFileName(item.name);
      let fileName = `${base}.${item.outExt}`;
      let counter = 1;
      while (usedNames.has(fileName)) {
        fileName = `${base}_${counter++}.${item.outExt}`;
      }
      usedNames.add(fileName);
      zip.file(fileName, item.convertedBlob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `Astrava_Converter_${readyItems.length}_dosya.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
  } finally {
    dom.downloadZipBtn.innerHTML = originalText;
    dom.downloadZipBtn.disabled = false;
  }
}

function openPreviewModal(item) {
  if (!item.origPreviewUrl) return;

  dom.modalFileName.textContent = item.name;
  dom.modalFileMeta.textContent = `${item.origExt.toUpperCase()} → ${(item.outExt || state.targetExt).toUpperCase()}`;

  dom.modalOrigImg.src = item.origPreviewUrl;
  dom.modalOrigInfo.textContent = `${formatBytes(item.origSize)} • ${item.origWidth}×${item.origHeight} px`;

  if (item.convertedUrl && item.convertedBlob) {
    if (item.outExt === 'pdf') {
      dom.modalNewImg.src = item.origPreviewUrl;
    } else {
      dom.modalNewImg.src = item.convertedUrl;
    }
    dom.modalNewInfo.textContent = `${formatBytes(item.convertedBlob.size)} • ${item.outWidth}×${item.outHeight} px`;
  } else {
    dom.modalNewImg.src = item.origPreviewUrl;
    dom.modalNewInfo.textContent = 'Henüz dönüştürülmedi';
  }

  dom.previewModal.classList.remove('hidden');
}

/* ==========================================
   ETKİLEŞİM VE EVENT LISTENER'LAR
   ========================================== */

async function reconvertAllFiles() {
  if (state.files.length === 0) return;
  dom.convertAllBtn.disabled = true;
  dom.convertAllBtnText.textContent = 'Dönüştürülüyor...';

  for (const item of state.files) {
    await processSingleItem(item);
  }

  dom.convertAllBtnText.textContent = 'Tümünü Yeniden Dönüştür';
  dom.convertAllBtn.disabled = false;
}

function initEventListeners() {
  // Format Seçimi
  dom.formatGrid.addEventListener('click', (e) => {
    const chip = e.target.closest('.format-chip');
    if (!chip) return;

    dom.formatGrid.querySelectorAll('.format-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');

    state.targetFormat = chip.dataset.format;
    state.targetExt = chip.dataset.ext;
    dom.formatDescription.textContent = FORMAT_DESCRIPTIONS[state.targetFormat] || '';

    reconvertAllFiles();
  });

  // Sıkıştırma Modu Seçimi (Kalite vs Hedef MB)
  dom.modeQualityBtn.addEventListener('click', () => {
    state.compressionMode = 'quality';
    dom.modeQualityBtn.classList.add('active');
    dom.modeTargetBtn.classList.remove('active');
    dom.qualityModeBox.classList.remove('hidden');
    dom.targetSizeModeBox.classList.add('hidden');
    reconvertAllFiles();
  });

  dom.modeTargetBtn.addEventListener('click', () => {
    state.compressionMode = 'targetSize';
    dom.modeTargetBtn.classList.add('active');
    dom.modeQualityBtn.classList.remove('active');
    dom.targetSizeModeBox.classList.remove('hidden');
    dom.qualityModeBox.classList.add('hidden');
    reconvertAllFiles();
  });

  // Kalite Slider
  dom.qualitySlider.addEventListener('input', (e) => {
    state.quality = parseInt(e.target.value, 10);
    dom.qualityValueLabel.textContent = `%${state.quality}`;
  });
  dom.qualitySlider.addEventListener('change', () => reconvertAllFiles());

  // Hedef Boyut (MB/KB)
  dom.targetSizeInput.addEventListener('input', (e) => {
    state.targetSizeValue = parseFloat(e.target.value) || 0.1;
  });
  dom.targetSizeInput.addEventListener('change', () => reconvertAllFiles());

  dom.targetUnitSelect.addEventListener('change', (e) => {
    state.targetSizeUnit = e.target.value;
    reconvertAllFiles();
  });

  document.querySelectorAll('.preset-tag').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.dataset.val);
      const unit = btn.dataset.unit;
      state.targetSizeValue = val;
      state.targetSizeUnit = unit;
      dom.targetSizeInput.value = val;
      dom.targetUnitSelect.value = unit;
      reconvertAllFiles();
    });
  });

  dom.autoScaleCheck.addEventListener('change', (e) => {
    state.autoScaleForTarget = e.target.checked;
    reconvertAllFiles();
  });

  // Çözünürlük / Boyutlandırma Modu
  dom.resizeModeSelect.addEventListener('change', (e) => {
    state.resizeMode = e.target.value;
    dom.resizeScaleBox.classList.toggle('hidden', state.resizeMode !== 'scale');
    dom.resizeDimensionsBox.classList.toggle(
      'hidden',
      state.resizeMode !== 'maxDimensions' && state.resizeMode !== 'exact'
    );
    reconvertAllFiles();
  });

  dom.scaleSlider.addEventListener('input', (e) => {
    state.resizeScale = parseInt(e.target.value, 10);
    dom.scaleValueLabel.textContent = `%${state.resizeScale}`;
  });
  dom.scaleSlider.addEventListener('change', () => reconvertAllFiles());

  dom.resizeWidthInput.addEventListener('change', (e) => {
    state.resizeWidth = parseInt(e.target.value, 10) || null;
    reconvertAllFiles();
  });

  dom.resizeHeightInput.addEventListener('change', (e) => {
    state.resizeHeight = parseInt(e.target.value, 10) || null;
    reconvertAllFiles();
  });

  // Arka Plan Rengi
  dom.bgColorInput.addEventListener('input', (e) => {
    state.backgroundColor = e.target.value;
    dom.bgColorHex.textContent = e.target.value.toUpperCase();
  });
  dom.bgColorInput.addEventListener('change', () => reconvertAllFiles());

  // Ayarları Sıfırla
  dom.resetSettingsBtn.addEventListener('click', () => {
    state.compressionMode = 'quality';
    state.quality = 80;
    state.targetSizeValue = 0.5;
    state.targetSizeUnit = 'MB';
    state.resizeMode = 'none';
    state.backgroundColor = '#ffffff';

    dom.qualitySlider.value = 80;
    dom.qualityValueLabel.textContent = '%80';
    dom.targetSizeInput.value = 0.5;
    dom.targetUnitSelect.value = 'MB';
    dom.resizeModeSelect.value = 'none';
    dom.resizeScaleBox.classList.add('hidden');
    dom.resizeDimensionsBox.classList.add('hidden');
    dom.bgColorInput.value = '#ffffff';
    dom.bgColorHex.textContent = '#FFFFFF';
    dom.modeQualityBtn.click();
  });

  // Tümünü Dönüştür
  dom.convertAllBtn.addEventListener('click', () => reconvertAllFiles());

  // Sürükle & Bırak ve Dosya Seçimi
  dom.dropzone.addEventListener('click', () => dom.fileInput.click());
  dom.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dom.fileInput.click();
    }
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleIncomingFiles(e.target.files);
      dom.fileInput.value = '';
    }
  });

  dom.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropzone.classList.add('dragover');
  });

  dom.dropzone.addEventListener('dragleave', () => {
    dom.dropzone.classList.remove('dragover');
  });

  dom.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleIncomingFiles(e.dataTransfer.files);
    }
  });

  // Panodan Yapıştırma (Ctrl+V)
  window.addEventListener('paste', (e) => {
    if (e.clipboardData && e.clipboardData.files.length > 0) {
      handleIncomingFiles(e.clipboardData.files);
    }
  });

  // Toplu Aksiyonlar
  dom.clearAllBtn.addEventListener('click', clearAllItems);
  dom.downloadZipBtn.addEventListener('click', downloadAllAsZip);

  // Modal Kapatma
  dom.closeModalBtn.addEventListener('click', () => dom.previewModal.classList.add('hidden'));
  dom.previewModal.addEventListener('click', (e) => {
    if (e.target === dom.previewModal) dom.previewModal.classList.add('hidden');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dom.previewModal.classList.add('hidden');
  });
}

initEventListeners();

