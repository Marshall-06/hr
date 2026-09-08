/**
 * Anketa 3×4 surat (webkamera + faýl).
 * Papka/USB saklamak ýOK — surat diňe forma goşulýar.
 * Diňe 1 surat; alnandan soň kamera ýapylýar.
 */
const PHOTO_RATIO = 3 / 4;
const PHOTO_OUT_W = 450;
const PHOTO_OUT_H = 600;
const MAX_PHOTOS = 1;
/**
 * 3×4 kesimde merkeze görä çepe süýşme (0.10 = 10%).
 * Çep ýüz / egin kesilmesin — kesim gutusy çepe süýşýär, netijede surat sagahyrak merkezleşýär.
 */
const CROP_BIAS_X = -0.10;
const CROP_BIAS_Y = -0.02;

/** Ähli widget-lar şol bir store ulanýar — getItems hemişe dogry */
const photoStore = {
  items: /** @type {{ file: File, url: string }[]} */ ([]),
  pending: 0,
  userTouched: false,
};

function syncPhotoToFormInput(file) {
  try {
    const input = document.getElementById('anketa-photo-submit')
      || document.querySelector('input[name="photo"][data-anketa-photo]');
    if (!input) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    input.files = dt.files;
    input.dataset.hasPhoto = file ? '1' : '0';
  } catch (e) {
    console.warn('photo form sync', e);
  }
}

function setPhotoItems(nextItems) {
  photoStore.items.forEach((item) => {
    try { URL.revokeObjectURL(item.url); } catch { /* */ }
  });
  photoStore.items = nextItems;
  window.__kerwenPhotoFiles = nextItems.map((x) => x.file);
  syncPhotoToFormInput(nextItems[0]?.file || null);
}

function pushPhotoItem(item) {
  photoStore.items.push(item);
  window.__kerwenPhotoFiles = photoStore.items.map((x) => x.file);
  syncPhotoToFormInput(photoStore.items[0]?.file || null);
}

function dataUrlToFile(dataUrl, name = 'photo.jpg') {
  const [meta, b64] = String(dataUrl).split(',');
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

async function urlToFile(src, name = 'photo.jpg') {
  const s = String(src || '');
  if (s.startsWith('data:')) return dataUrlToFile(s, name);
  const res = await fetch(s);
  if (!res.ok) throw new Error('Surat ýüklenmedi');
  const blob = await res.blob();
  const mime = blob.type || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.${ext}`, { type: mime });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropTo3x4File(source, name = `foto-3x4-${Date.now()}.jpg`) {
  let img;
  if (source instanceof HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    const vw = source.videoWidth || 640;
    const vh = source.videoHeight || 480;
    canvas.width = vw;
    canvas.height = vh;
    canvas.getContext('2d').drawImage(source, 0, 0, vw, vh);
    img = await loadImageFromSrc(canvas.toDataURL('image/jpeg', 0.95));
  } else if (source instanceof HTMLCanvasElement) {
    img = await loadImageFromSrc(source.toDataURL('image/jpeg', 0.95));
  } else if (source instanceof File || source instanceof Blob) {
    const url = URL.createObjectURL(source);
    try {
      img = await loadImageFromSrc(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else if (typeof source === 'string') {
    img = await loadImageFromSrc(source);
  } else {
    throw new Error('Surat çeşmesi nädogry');
  }

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  let cropW;
  let cropH;
  if (iw / ih > PHOTO_RATIO) {
    cropH = ih;
    cropW = Math.round(ih * PHOTO_RATIO);
  } else {
    cropW = iw;
    cropH = Math.round(iw / PHOTO_RATIO);
  }
  // Merkez + çe: çepe süýşür (sx kiçelýär) → çep tarap kesilmez, ýüz sagahyrak merkezde
  let sx = Math.round((iw - cropW) / 2 + cropW * CROP_BIAS_X);
  let sy = Math.round((ih - cropH) / 2 + cropH * CROP_BIAS_Y);
  sx = Math.max(0, Math.min(sx, iw - cropW));
  sy = Math.max(0, Math.min(sy, ih - cropH));

  const out = document.createElement('canvas');
  out.width = PHOTO_OUT_W;
  out.height = PHOTO_OUT_H;
  out.getContext('2d').drawImage(img, sx, sy, cropW, cropH, 0, 0, PHOTO_OUT_W, PHOTO_OUT_H);

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Surat taýýarlanmady');
  return new File([blob], name, { type: 'image/jpeg' });
}

function suggestedHttpsUrl() {
  if (typeof location === 'undefined') return '';
  if (location.protocol === 'https:') return '';
  const host = location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') return '';
  const port = window.KERWEN_HTTPS_PORT || 8443;
  return `https://${host}:${port}${location.pathname}${location.search || ''}`;
}

function isCameraAllowed() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

function cameraBlockReason() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Bu brauzer kamerany goldamaýar.';
  }
  if (!window.isSecureContext) {
    return 'Kamera HTTPS gerek. Operatorlar: https://ADMIN_IP:8443 (localhost däl). USB kamera şol PC-de birikmeli. Ýa-da «Faýldan saýla».';
  }
  return '';
}

/** Gallery-däki blob URL-den File dikelt (desinhron ýagdaýda) */
async function recoverFilesFromGallery(root) {
  const imgs = [...(root?.querySelectorAll('.photo-gallery .photo-thumb img, #photo-gallery .photo-thumb img') || [])];
  const out = [];
  for (const img of imgs) {
    const src = img?.src;
    if (!src) continue;
    try {
      const file = await urlToFile(src, `foto-recover-${Date.now()}.jpg`);
      const cropped = await cropTo3x4File(file, file.name);
      out.push(cropped);
    } catch { /* skip */ }
  }
  return out;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {(items: {file:File,url:string}[]) => void} [opts.onChange]
 * @param {number} [opts.max]
 */
function createPhotoCapture(opts = {}) {
  const root = opts.root || document.querySelector('.photo-capture');
  const max = Math.min(opts.max || MAX_PHOTOS, MAX_PHOTOS);
  if (!root) {
    return {
      getItems: () => photoStore.items.slice(),
      hasPhotos: () => photoStore.items.length > 0,
      isBusy: () => photoStore.pending > 0,
      setFromDataUrls: async () => {},
      clear: () => {},
      destroy: () => {},
      stopCamera: async () => {},
      toDataUrls: async () => [],
      recoverFromDom: async () => [],
    };
  }

  // Bir root üçin diňe bir gezek bagla
  if (root.dataset.photoBound === '1' && root.__kerwenPhotoCtl) {
    return root.__kerwenPhotoCtl;
  }
  root.dataset.photoBound = '1';

  const photoFileInput = root.querySelector('#photo-file') || root.querySelector('input[type=file]');
  const photoGallery = root.querySelector('#photo-gallery') || root.querySelector('.photo-gallery');
  const photoCountHint = root.querySelector('#photo-count-hint');
  const btnClearPhoto = root.querySelector('#btn-clear-photo');
  const cameraPanel = root.querySelector('#camera-panel') || root.querySelector('.camera-panel');
  const cameraVideo = root.querySelector('#camera-video') || root.querySelector('video');
  const cameraSelect = root.querySelector('#camera-select');
  const btnOpen = root.querySelector('#btn-open-camera');
  const btnClose = root.querySelector('#btn-close-camera');
  const btnCapture = root.querySelector('#btn-capture');
  const btnPickFolder = root.querySelector('#btn-photo-folder');
  const folderHint = root.querySelector('#photo-folder-hint');
  const alertHost = () => document.getElementById('alert-box');

  let cameraStream = null;

  // Papka düwmesi / hint — gizle (hökmany däl, ulanylmaýar)
  if (btnPickFolder) btnPickFolder.style.display = 'none';
  if (folderHint) {
    folderHint.textContent = 'Surat diňe anketa goşulýar — papka gerek däl';
  }

  function beginOp() { photoStore.pending += 1; }
  function endOp() { photoStore.pending = Math.max(0, photoStore.pending - 1); }

  function notify() {
    root.dataset.photoCount = String(photoStore.items.length);
    if (typeof opts.onChange === 'function') opts.onChange(photoStore.items.slice());
  }

  function updatePhotoUi() {
    if (photoGallery) {
      photoGallery.innerHTML = photoStore.items.map((item, i) => `
        <div class="photo-thumb photo-thumb-3x4">
          <img src="${item.url}" alt="Surat ${i + 1}">
          <span class="photo-idx">3×4</span>
          <button type="button" class="photo-remove" data-idx="${i}" title="Aýyr">×</button>
        </div>
      `).join('');
      photoGallery.querySelectorAll('.photo-remove').forEach((btn) => {
        btn.addEventListener('click', () => removePhotoAt(Number(btn.dataset.idx)));
      });
    }
    if (photoCountHint) {
      photoCountHint.textContent = photoStore.items.length
        ? 'Surat taýýar ✓ — anketany iberip bilersiňiz'
        : '0 / 1 surat (3×4) — isläge görä';
    }
    if (btnClearPhoto) btnClearPhoto.style.display = photoStore.items.length ? '' : 'none';
    notify();
  }

  function clearPhoto() {
    setPhotoItems([]);
    if (photoFileInput) photoFileInput.value = '';
      updatePhotoUi();
  }

  function removePhotoAt(idx) {
    const item = photoStore.items[idx];
    if (!item) return;
    photoStore.userTouched = true;
    try { URL.revokeObjectURL(item.url); } catch { /* */ }
    photoStore.items.splice(idx, 1);
    window.__kerwenPhotoFiles = photoStore.items.map((x) => x.file);
    syncPhotoToFormInput(photoStore.items[0]?.file || null);
    updatePhotoUi();
  }

  async function stopCameraKeepPanel() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    if (cameraVideo) cameraVideo.srcObject = null;
  }

  async function stopCamera() {
    await stopCameraKeepPanel();
    if (cameraPanel) {
      cameraPanel.classList.add('hidden');
      cameraPanel.classList.remove('camera-panel--overlay');
    }
  }

  async function listCameras() {
    if (!navigator.mediaDevices?.enumerateDevices || !cameraSelect) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    cameraSelect.innerHTML = cams.map((d, i) =>
      `<option value="${d.deviceId}">${d.label || `Kamera ${i + 1}`}</option>`,
    ).join('') || '<option value="">Kamera tapylmady</option>';
  }

  async function addPhotoFile(file) {
    if (!file) return false;
    if (photoStore.items.length >= max) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), 'Eýýäm 1 surat bar — täzelemek üçin öňküsini aýryň', 'error');
      }
      return false;
    }
    beginOp();
    try {
      const cropped = await cropTo3x4File(file, `foto-3x4-${Date.now()}.jpg`);
      photoStore.userTouched = true;
      pushPhotoItem({ file: cropped, url: URL.createObjectURL(cropped) });
      updatePhotoUi();
      await stopCamera();
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), 'Surat anketa goşuldy — indi iberip bilersiňiz', 'success');
      }
      return true;
    } catch (e) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), e.message || 'Surat işlenmedi', 'error');
      }
      return false;
    } finally {
      endOp();
    }
  }

  async function startCamera(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), 'Bu brauzer kamerany goldamaýar. «Faýldan saýla» ulanyň.', 'error');
      }
      return;
    }
    if (!window.isSecureContext) {
      const httpsUrl = window.KERWEN_HTTPS_URL || suggestedHttpsUrl();
      const msg = 'Kamera diňe HTTPS bilen işleýär. «HTTPS aç» basyň ýa-da «Faýldan saýla».';
      if (typeof showAlert === 'function') showAlert(alertHost(), msg, 'error');
      else alert(msg);
      if (httpsUrl && confirm('Webkamera üçin HTTPS sahypasyna geçmeli?')) {
        location.href = httpsUrl;
      }
      return;
    }
    if (photoStore.items.length >= max) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), 'Eýýäm 1 surat bar — täzelemek üçin öňküsini aýryň', 'error');
      }
      return;
    }

    if (cameraPanel) {
      cameraPanel.classList.remove('hidden');
      cameraPanel.classList.add('camera-panel--overlay');
      try { cameraPanel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ }
    }

    await stopCameraKeepPanel();
    const constraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } }
        : {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
    };

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cameraVideo) {
        cameraVideo.srcObject = cameraStream;
        cameraVideo.muted = true;
        cameraVideo.setAttribute('playsinline', 'true');
        await cameraVideo.play().catch(() => null);
      }
      if (cameraPanel) {
        cameraPanel.classList.remove('hidden');
        cameraPanel.classList.add('camera-panel--overlay');
      }
      await listCameras();
      if (deviceId && cameraSelect) cameraSelect.value = deviceId;
    } catch (err) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 960 } },
        });
        if (cameraVideo) {
          cameraVideo.srcObject = cameraStream;
          cameraVideo.muted = true;
          await cameraVideo.play().catch(() => null);
        }
        if (cameraPanel) {
          cameraPanel.classList.remove('hidden');
          cameraPanel.classList.add('camera-panel--overlay');
        }
        await listCameras();
        return;
      } catch { /* */ }

      if (cameraPanel) {
        cameraPanel.classList.add('hidden');
        cameraPanel.classList.remove('camera-panel--overlay');
      }
      const msg = cameraBlockReason()
        || 'Kamera açylmady. Rugsat beriň ýa-da USB kamerany birikdiriň.';
      if (typeof showAlert === 'function') showAlert(alertHost(), msg, 'error');
      else alert(msg);
    }
  }

  async function captureFromCamera() {
    if (!cameraStream || !cameraVideo) return;
    if (photoStore.items.length >= max) {
      await stopCamera();
      return;
    }
    if (!cameraVideo.videoWidth) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), 'Kamera entek taýýar däl — 1–2 sekunt garaşyp ýene basyň', 'error');
      }
      return;
    }
    beginOp();
    try {
      const stamp = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const name = `Kerwen-foto-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.jpg`;
      const file = await cropTo3x4File(cameraVideo, name);
      photoStore.userTouched = true;
      pushPhotoItem({ file, url: URL.createObjectURL(file) });
      updatePhotoUi();
      await stopCamera();
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), 'Surat anketa goşuldy — indi iberip bilersiňiz', 'success');
      }
    } catch (e) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), e.message || 'Surat düşürilmedi', 'error');
      }
    } finally {
      endOp();
    }
  }

  async function setFromDataUrls(urls = [], { force = false } = {}) {
    if (!force && photoStore.userTouched && photoStore.items.length) return;
    const list = (Array.isArray(urls) ? urls : []).filter(Boolean).slice(0, max);
    if (!list.length) {
      if (force || !photoStore.items.length) clearPhoto();
      return;
    }
    beginOp();
    const next = [];
    try {
      for (const dataUrl of list) {
      try {
        const file = await urlToFile(dataUrl, `draft-3x4-${Date.now()}.jpg`);
        const cropped = await cropTo3x4File(file);
          next.push({ file: cropped, url: URL.createObjectURL(cropped) });
        } catch { /* skip */ }
      }
      if (!next.length) return;
      if (photoStore.userTouched && photoStore.items.length && !force) return;
      setPhotoItems(next);
      if (photoFileInput) photoFileInput.value = '';
      updatePhotoUi();
    } finally {
      endOp();
    }
  }

  async function setFromReadyFile(file, { force = true } = {}) {
    if (!file) return false;
    if (!force && photoStore.userTouched && photoStore.items.length) return false;
    photoStore.userTouched = true;
    const url = URL.createObjectURL(file);
    setPhotoItems([{ file, url }]);
    if (photoFileInput) photoFileInput.value = '';
    updatePhotoUi();
    return true;
  }

  async function setFromUrl(url, { force = true } = {}) {
    if (!url) return false;
    beginOp();
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Surat ýüklenmedi');
      const blob = await res.blob();
      const file = new File([blob], `scan-3x4-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
      return setFromReadyFile(file, { force });
    } catch (e) {
      if (typeof showAlert === 'function') {
        showAlert(alertHost(), e.message || 'Surat ýüklenmedi', 'error');
      }
      return false;
    } finally {
      endOp();
    }
  }

  async function toDataUrls() {
    const out = [];
    for (const item of photoStore.items) {
      out.push(await fileToDataUrl(item.file));
    }
    return out;
  }

  async function recoverFromDom() {
    if (photoStore.items.length) return photoStore.items.slice();
    const files = await recoverFilesFromGallery(root);
    if (!files.length) return [];
    photoStore.userTouched = true;
    setPhotoItems(files.map((file) => ({ file, url: URL.createObjectURL(file) })));
    updatePhotoUi();
    return photoStore.items.slice();
  }

  photoFileInput?.addEventListener('change', async () => {
    const files = [...(photoFileInput.files || [])];
    photoFileInput.value = '';
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      await addPhotoFile(f);
    }
  });
  btnClearPhoto?.addEventListener('click', (e) => {
    e.preventDefault();
    photoStore.userTouched = true;
    clearPhoto();
  });
  btnOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startCamera(cameraSelect?.value || undefined);
  });
  btnClose?.addEventListener('click', (e) => {
    e.preventDefault();
    stopCamera();
  });
  btnCapture?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    captureFromCamera();
  });
  cameraSelect?.addEventListener('change', () => {
    if (cameraSelect.value) startCamera(cameraSelect.value);
  });
  window.addEventListener('beforeunload', () => { stopCamera(); });

  updatePhotoUi();

  const api = {
    getItems: () => photoStore.items.slice(),
    hasPhotos: () => photoStore.items.length > 0,
    isBusy: () => photoStore.pending > 0,
    wasTouched: () => Boolean(photoStore.userTouched),
    clear: () => { photoStore.userTouched = true; clearPhoto(); },
    stopCamera,
    setFromDataUrls,
    setFromUrl,
    setFromReadyFile,
    toDataUrls,
    recoverFromDom,
    destroy: () => { stopCamera(); },
  };
  root.__kerwenPhotoCtl = api;
  window.__kerwenPhotoCtl = api;
  return api;
}

window.AnketaPhoto = {
  MAX_PHOTOS,
  PHOTO_RATIO,
  cropTo3x4File,
  fileToDataUrl,
  dataUrlToFile,
  isCameraAllowed,
  cameraBlockReason,
  suggestedHttpsUrl,
  createPhotoCapture,
  recoverFilesFromGallery,
  getStore: () => photoStore,
  getFiles: () => (photoStore.items.map((x) => x.file)),
};
