/* ============================================================
 * 최애 카메라 (AR-style Photo Frame Camera)
 * ----------------------------------------------------------
 * - 카메라 위에 캐릭터 PNG를 오버레이
 * - 드래그(이동), 핀치(크기), 반전, 후면/전면 전환
 * - 셔터 누르면 영상 + 캐릭터 합성된 단일 이미지 저장
 * - 사용자가 자기 기기에서 이미지를 추가하여 캐릭터 슬롯에
 *   저장 (브라우저 localStorage, 서버 업로드 없음)
 * ============================================================ */

// ===== 기본 placeholder 캐릭터 (앱에 함께 배포되는 일반 도형) =====
const DEFAULT_CHARACTERS = [];

// localStorage 키
const STORAGE_KEY = 'choae_custom_characters_v1';
const MAX_IMAGE_DIM = 800; // 추가된 이미지의 최대 변(px). 저장 공간 절약용.

// ===== DOM 참조 =====
const $ = (sel) => document.querySelector(sel);
const startScreen = $('#start-screen');
const cameraScreen = $('#camera-screen');
const previewScreen = $('#preview-screen');
const video = $('#camera');
const character = $('#character');
const gallery = $('#character-gallery');
const previewImg = $('#preview-img');
const errorToast = $('#error-toast');
const fileInput = $('#file-input');
const addImageModal = $('#add-image-modal');
const addImagePreview = $('#add-image-preview');
const cropScreen = $('#crop-screen');
const cropStage = $('#crop-stage');
const cropImage = $('#crop-image');
const cropFrame = $('#crop-frame');

// ===== 상태 =====
let stream = null;
let isFrontCamera = false;
let currentCharId = null;

// 캐릭터 위치/크기 상태 (스크린 픽셀 기준)
let charState = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  width: 220,
  flipped: false,
};

let lastCapturedBlob = null;

// 이미지 추가 모달용 임시 상태
let pendingImage = null; // { resizedDataUrl }

// 자르기 화면 상태
let cropState = null; // { offsetX, offsetY, displayW, displayH, imgW, imgH, rectX, rectY, rectW, rectH }

// ===== 유틸 =====
function showToast(msg, ms = 2500) {
  errorToast.textContent = msg;
  errorToast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => errorToast.classList.add('hidden'), ms);
}

function showScreen(name) {
  [startScreen, cameraScreen, previewScreen].forEach(s => s.classList.add('hidden'));
  ({ start: startScreen, camera: cameraScreen, preview: previewScreen })[name].classList.remove('hidden');
}

// ===== 사용자 추가 캐릭터 (localStorage) =====
function loadCustomCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveCustomCharacters(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.error(e);
    showToast('저장 공간이 부족합니다.\n기존 캐릭터를 삭제 후 다시 시도해주세요.', 4500);
    return false;
  }
}

function getAllCharacters() {
  // 사용자 추가가 먼저 (가장 자주 쓸 것), 그다음 기본 placeholder
  return [...loadCustomCharacters(), ...DEFAULT_CHARACTERS];
}

function findCharacter(id) {
  return getAllCharacters().find(c => c.id === id);
}

// ===== 이미지 처리 헬퍼 =====
function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'));
    img.src = url;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
    reader.readAsDataURL(file);
  });
}

async function resizeDataUrl(dataUrl, maxDim) {
  const img = await loadImageFromUrl(dataUrl);
  const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

// ===== 이미지 추가 모달 흐름 =====
async function handleFileSelected(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    showToast('이미지 파일만 추가할 수 있습니다');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('이미지가 너무 큽니다 (최대 20MB)');
    return;
  }

  showToast('이미지 처리 중...', 1500);

  let resizedDataUrl;
  try {
    const original = await readFileAsDataUrl(file);
    resizedDataUrl = await resizeDataUrl(original, MAX_IMAGE_DIM);
  } catch (e) {
    showToast('이미지 처리 실패: ' + e.message, 3500);
    return;
  }

  pendingImage = { resizedDataUrl };
  addImagePreview.src = resizedDataUrl;
  addImageModal.classList.remove('hidden');
}

function confirmAddImage() {
  if (!pendingImage) {
    hideAddImageModal();
    return;
  }
  const customs = loadCustomCharacters();
  const newChar = {
    id: 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    src: pendingImage.resizedDataUrl,
    name: '내 캐릭터 ' + (customs.length + 1),
    custom: true,
  };
  customs.unshift(newChar);
  if (saveCustomCharacters(customs)) {
    buildGallery();
    selectCharacter(newChar.id);
    showToast('추가되었습니다', 1200);
  }
  hideAddImageModal();
}

function hideAddImageModal() {
  addImageModal.classList.add('hidden');
  pendingImage = null;
  addImagePreview.src = '';
}

// ===== 자르기 화면 =====
async function openCropScreen() {
  if (!pendingImage) return;

  cropImage.src = pendingImage.resizedDataUrl;

  // 이미지 로드 대기
  await new Promise((resolve, reject) => {
    if (cropImage.complete && cropImage.naturalWidth) return resolve();
    const onLoad = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('이미지 로드 실패')); };
    const cleanup = () => {
      cropImage.removeEventListener('load', onLoad);
      cropImage.removeEventListener('error', onErr);
    };
    cropImage.addEventListener('load', onLoad);
    cropImage.addEventListener('error', onErr);
  });

  // 모달 잠시 가리고 자르기 화면 표시
  addImageModal.classList.add('hidden');
  cropScreen.classList.remove('hidden');

  // 레이아웃 적용 후 프레임 초기화
  await new Promise((r) => requestAnimationFrame(() => r()));
  initCropFrame();
}

function initCropFrame() {
  const stageRect = cropStage.getBoundingClientRect();
  const imgW = cropImage.naturalWidth;
  const imgH = cropImage.naturalHeight;
  if (!imgW || !imgH || !stageRect.width || !stageRect.height) return;

  // object-fit: contain 으로 표시되는 실제 크기/오프셋 계산
  const imgAspect = imgW / imgH;
  const stageAspect = stageRect.width / stageRect.height;
  let displayW, displayH;
  if (imgAspect > stageAspect) {
    displayW = stageRect.width;
    displayH = stageRect.width / imgAspect;
  } else {
    displayH = stageRect.height;
    displayW = stageRect.height * imgAspect;
  }
  const offsetX = (stageRect.width - displayW) / 2;
  const offsetY = (stageRect.height - displayH) / 2;

  // 초기 자르기 사각형: 이미지 영역의 안쪽 80%
  cropState = {
    offsetX, offsetY,
    displayW, displayH,
    imgW, imgH,
    rectX: offsetX + displayW * 0.1,
    rectY: offsetY + displayH * 0.1,
    rectW: displayW * 0.8,
    rectH: displayH * 0.8,
  };

  updateCropFrameUI();
}

function updateCropFrameUI() {
  if (!cropState) return;
  cropFrame.style.left = cropState.rectX + 'px';
  cropFrame.style.top = cropState.rectY + 'px';
  cropFrame.style.width = cropState.rectW + 'px';
  cropFrame.style.height = cropState.rectH + 'px';
}

function closeCropScreen(returnToModal = true) {
  cropScreen.classList.add('hidden');
  cropImage.src = '';
  cropState = null;
  if (returnToModal && pendingImage) {
    addImageModal.classList.remove('hidden');
  }
}

async function applyCrop() {
  if (!cropState || !pendingImage) {
    closeCropScreen();
    return;
  }

  const localX = cropState.rectX - cropState.offsetX;
  const localY = cropState.rectY - cropState.offsetY;
  const scaleX = cropState.imgW / cropState.displayW;
  const scaleY = cropState.imgH / cropState.displayH;
  const sx = Math.max(0, Math.round(localX * scaleX));
  const sy = Math.max(0, Math.round(localY * scaleY));
  const sw = Math.max(1, Math.min(cropState.imgW - sx, Math.round(cropState.rectW * scaleX)));
  const sh = Math.max(1, Math.min(cropState.imgH - sy, Math.round(cropState.rectH * scaleY)));

  try {
    const sourceImg = await loadImageFromUrl(pendingImage.resizedDataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, sw, sh);
    pendingImage.resizedDataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    showToast('자르기 실패: ' + e.message, 3000);
    closeCropScreen();
    return;
  }

  closeCropScreen(true);
  // 자른 결과를 모달 미리보기에 반영
  addImagePreview.src = pendingImage.resizedDataUrl;
}

// ===== 자르기 제스처 (드래그/리사이즈) =====
function setupCropGestures() {
  let dragInfo = null;

  cropFrame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.crop-handle')) return; // 핸들은 별도 처리
    e.preventDefault();
    e.stopPropagation();
    cropFrame.setPointerCapture(e.pointerId);
    dragInfo = {
      type: 'move',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...cropState },
    };
  });

  cropFrame.querySelectorAll('.crop-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      dragInfo = {
        type: 'resize',
        corner: handle.dataset.corner,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...cropState },
      };
    });
  });

  const onMove = (e) => {
    if (!dragInfo || !cropState) return;
    if (e.pointerId !== dragInfo.pointerId) return;
    e.preventDefault();

    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;
    const orig = dragInfo.orig;
    const minSize = 30;
    const minX = orig.offsetX;
    const minY = orig.offsetY;
    const maxX = orig.offsetX + orig.displayW;
    const maxY = orig.offsetY + orig.displayH;

    if (dragInfo.type === 'move') {
      let nx = orig.rectX + dx;
      let ny = orig.rectY + dy;
      nx = Math.max(minX, Math.min(maxX - orig.rectW, nx));
      ny = Math.max(minY, Math.min(maxY - orig.rectH, ny));
      cropState.rectX = nx;
      cropState.rectY = ny;
    } else if (dragInfo.type === 'resize') {
      let { rectX, rectY, rectW, rectH } = orig;
      const corner = dragInfo.corner;

      if (corner === 'nw' || corner === 'sw') {
        const newX = Math.max(minX, Math.min(rectX + rectW - minSize, rectX + dx));
        rectW = rectW - (newX - rectX);
        rectX = newX;
      }
      if (corner === 'ne' || corner === 'se') {
        rectW = Math.max(minSize, Math.min(maxX - rectX, rectW + dx));
      }
      if (corner === 'nw' || corner === 'ne') {
        const newY = Math.max(minY, Math.min(rectY + rectH - minSize, rectY + dy));
        rectH = rectH - (newY - rectY);
        rectY = newY;
      }
      if (corner === 'sw' || corner === 'se') {
        rectH = Math.max(minSize, Math.min(maxY - rectY, rectH + dy));
      }

      cropState.rectX = rectX;
      cropState.rectY = rectY;
      cropState.rectW = rectW;
      cropState.rectH = rectH;
    }

    updateCropFrameUI();
  };

  const onEnd = (e) => {
    if (dragInfo && e.pointerId === dragInfo.pointerId) {
      dragInfo = null;
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  document.addEventListener('pointercancel', onEnd);
}

function deleteCustomCharacter(id) {
  const customs = loadCustomCharacters();
  const filtered = customs.filter(c => c.id !== id);
  saveCustomCharacters(filtered);
  // 만약 지운 게 현재 선택된 캐릭터라면 다른 걸 선택
  if (currentCharId === id) {
    const all = getAllCharacters();
    if (all.length > 0) selectCharacter(all[0].id);
  } else {
    buildGallery();
  }
}

// ===== 캐릭터 갤러리 빌드 =====
function buildGallery() {
  const all = getAllCharacters();
  gallery.innerHTML = '';

  // "+" 추가 버튼 (항상 첫 번째)
  const addBtn = document.createElement('div');
  addBtn.className = 'thumb thumb-add';
  addBtn.title = '이미지 추가';
  addBtn.innerHTML = '<span class="plus">+</span>';
  addBtn.addEventListener('click', () => fileInput.click());
  gallery.appendChild(addBtn);

  // 각 캐릭터 썸네일
  all.forEach((c) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb' + (c.id === currentCharId ? ' active' : '');
    thumb.dataset.id = c.id;

    const im = document.createElement('img');
    im.src = c.src;
    im.alt = c.name;
    thumb.appendChild(im);

    if (c.custom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'thumb-delete';
      del.setAttribute('aria-label', '삭제');
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('이 캐릭터를 삭제할까요?')) {
          deleteCustomCharacter(c.id);
        }
      });
      thumb.appendChild(del);
    }

    thumb.addEventListener('click', () => selectCharacter(c.id));
    gallery.appendChild(thumb);
  });
}

function selectCharacter(id) {
  const c = findCharacter(id);
  if (!c) return;
  currentCharId = id;
  character.src = c.src;
  // 갤러리 active 갱신
  [...gallery.children].forEach((el) => {
    if (el.classList.contains('thumb-add')) return;
    el.classList.toggle('active', el.dataset.id === id);
  });
}

// ===== 캐릭터 위치/크기 적용 =====
function updateCharacterTransform() {
  const aspect = (character.naturalHeight && character.naturalWidth)
    ? character.naturalHeight / character.naturalWidth
    : 1.83;
  const w = charState.width;
  const h = w * aspect;
  character.style.width = w + 'px';
  character.style.height = h + 'px';
  character.style.left = (charState.x - w / 2) + 'px';
  character.style.top = (charState.y - h / 2) + 'px';
  character.style.transform = charState.flipped ? 'scaleX(-1)' : 'none';
}

// 이미지 로드 후 비율 반영
character.addEventListener('load', updateCharacterTransform);

// ===== 카메라 시작 =====
async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: isFrontCamera ? 'user' : 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    video.srcObject = stream;
    video.classList.toggle('mirrored', isFrontCamera);

    await new Promise((res) => {
      if (video.readyState >= 2) return res();
      video.onloadedmetadata = () => res();
    });
  } catch (err) {
    console.error(err);
    if (err.name === 'NotAllowedError') {
      showToast('카메라 권한이 거부되었습니다.\n브라우저 설정에서 허용해주세요.', 4000);
    } else if (err.name === 'NotFoundError') {
      showToast('카메라 장치를 찾을 수 없습니다.', 4000);
    } else if (err.name === 'NotReadableError') {
      showToast('다른 앱이 카메라를 사용 중입니다.', 4000);
    } else {
      showToast('카메라를 시작할 수 없습니다: ' + err.message, 4000);
    }
    throw err;
  }
}

// ===== 제스처: 드래그 + 핀치 =====
const activePointers = new Map();
let gestureStart = null;

function setupGestures() {
  cameraScreen.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .gallery, .top-bar, .bottom-bar, .char-controls')) return;
    e.preventDefault();
    cameraScreen.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebuildGestureStart();
  });

  cameraScreen.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gestureStart) return;

    const pts = [...activePointers.values()];

    if (gestureStart.type === 'drag' && pts.length === 1) {
      const dx = pts[0].x - gestureStart.pointer.x;
      const dy = pts[0].y - gestureStart.pointer.y;
      charState.x = gestureStart.char.x + dx;
      charState.y = gestureStart.char.y + dy;
      charState.x = Math.max(20, Math.min(window.innerWidth - 20, charState.x));
      charState.y = Math.max(20, Math.min(window.innerHeight - 20, charState.y));
      updateCharacterTransform();
    } else if (gestureStart.type === 'pinch' && pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / gestureStart.dist;
      const newW = gestureStart.char.width * ratio;
      charState.width = Math.max(60, Math.min(window.innerWidth * 1.6, newW));
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      charState.x = gestureStart.char.x + (cx - gestureStart.center.x);
      charState.y = gestureStart.char.y + (cy - gestureStart.center.y);
      updateCharacterTransform();
    }
  });

  const endPointer = (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    rebuildGestureStart();
  };
  cameraScreen.addEventListener('pointerup', endPointer);
  cameraScreen.addEventListener('pointercancel', endPointer);
}

function rebuildGestureStart() {
  const pts = [...activePointers.values()];
  if (pts.length === 1) {
    gestureStart = {
      type: 'drag',
      pointer: { ...pts[0] },
      char: { ...charState },
    };
  } else if (pts.length === 2) {
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    gestureStart = {
      type: 'pinch',
      dist,
      center: { x: cx, y: cy },
      char: { ...charState },
    };
  } else {
    gestureStart = null;
  }
}

// ===== 캡처 (영상 + 캐릭터를 단일 이미지로) =====
async function capture() {
  if (!video.videoWidth) {
    showToast('카메라가 아직 준비되지 않았습니다');
    return;
  }

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(screenW * dpr);
  canvas.height = Math.round(screenH * dpr);
  const ctx = canvas.getContext('2d');

  const vW = video.videoWidth;
  const vH = video.videoHeight;
  const screenAspect = screenW / screenH;
  const videoAspect = vW / vH;

  let sx, sy, sw, sh;
  if (videoAspect > screenAspect) {
    sh = vH;
    sw = vH * screenAspect;
    sx = (vW - sw) / 2;
    sy = 0;
  } else {
    sw = vW;
    sh = vW / screenAspect;
    sx = 0;
    sy = (vH - sh) / 2;
  }

  if (isFrontCamera) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  if (character.complete && character.naturalWidth) {
    const aspect = character.naturalHeight / character.naturalWidth;
    const cw = charState.width * dpr;
    const ch = cw * aspect;
    const cx = charState.x * dpr;
    const cy = charState.y * dpr;

    ctx.save();
    ctx.translate(cx, cy);
    if (charState.flipped) ctx.scale(-1, 1);
    ctx.drawImage(character, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
  }

  await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      lastCapturedBlob = blob;
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      showScreen('preview');
      resolve();
    }, 'image/jpeg', 0.95);
  });
}

// ===== 저장 =====
async function downloadImage() {
  if (!lastCapturedBlob) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `choae_camera_${ts}.jpg`;

  // 모바일: Web Share API로 네이티브 공유 시트 → "사진에 저장" 가능
  if (navigator.share) {
    try {
      const file = new File([lastCapturedBlob], fileName, { type: 'image/jpeg' });
      const shareData = { files: [file] };
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (e) {
      // 사용자가 공유 취소하거나 파일 공유 미지원 시 폴백
      if (e.name === 'AbortError') return;
      console.warn('Share API 실패, 다운로드로 전환:', e);
    }
  }

  // 폴백: 기존 다운로드 방식
  const url = URL.createObjectURL(lastCapturedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== 이벤트 바인딩 =====
$('#start-btn').addEventListener('click', async () => {
  try {
    await startCamera();
    showScreen('camera');
    const all = getAllCharacters();
    if (all.length > 0 && !currentCharId) selectCharacter(all[0].id);
    updateCharacterTransform();
  } catch (e) {
    /* startCamera 내부에서 토스트 표시됨 */
  }
});

$('#close-btn').addEventListener('click', () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  showScreen('start');
});

$('#flip-camera-btn').addEventListener('click', async () => {
  isFrontCamera = !isFrontCamera;
  try { await startCamera(); } catch (e) {}
});

$('#flip-char-btn').addEventListener('click', () => {
  charState.flipped = !charState.flipped;
  updateCharacterTransform();
});

$('#reset-char-btn').addEventListener('click', () => {
  charState.x = window.innerWidth / 2;
  charState.y = window.innerHeight / 2;
  charState.width = 220;
  charState.flipped = false;
  updateCharacterTransform();
});

// 크기 조절 버튼 (한 번 누를 때마다 약 15% 변화)
const SIZE_STEP = 1.15;
const SIZE_MIN = 60;

function getSizeMax() {
  return window.innerWidth * 1.6;
}

$('#size-up-btn').addEventListener('click', () => {
  charState.width = Math.min(getSizeMax(), charState.width * SIZE_STEP);
  updateCharacterTransform();
});

$('#size-down-btn').addEventListener('click', () => {
  charState.width = Math.max(SIZE_MIN, charState.width / SIZE_STEP);
  updateCharacterTransform();
});

// 이미지 추가 모달 이벤트
$('#add-image-confirm').addEventListener('click', confirmAddImage);
$('#add-image-cancel').addEventListener('click', hideAddImageModal);

// 자르기 이벤트
$('#crop-btn').addEventListener('click', () => {
  openCropScreen().catch((e) => showToast('자르기 화면 열기 실패: ' + e.message, 3000));
});
$('#crop-cancel').addEventListener('click', () => closeCropScreen(true));
$('#crop-apply').addEventListener('click', applyCrop);

$('#shutter-btn').addEventListener('click', capture);

$('#retake-btn').addEventListener('click', () => {
  if (lastCapturedBlob) {
    URL.revokeObjectURL(previewImg.src);
    lastCapturedBlob = null;
  }
  showScreen('camera');
});

$('#download-btn').addEventListener('click', downloadImage);

// 파일 인풋 변경 시 처리
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) {
    await handleFileSelected(file);
  }
  // 같은 파일을 다시 선택해도 change 이벤트가 뜨도록 초기화
  fileInput.value = '';
});

// 화면 회전/리사이즈 시 캐릭터가 화면 밖으로 안 나가게
window.addEventListener('resize', () => {
  charState.x = Math.max(20, Math.min(window.innerWidth - 20, charState.x));
  charState.y = Math.max(20, Math.min(window.innerHeight - 20, charState.y));
  updateCharacterTransform();
});

// 더블탭 줌 방지 (iOS)
document.addEventListener('gesturestart', (e) => e.preventDefault());

// 초기화
buildGallery();
setupGestures();
setupCropGestures();

if (!window.isSecureContext) {
  showToast('보안 연결(HTTPS 또는 localhost)에서만\n카메라가 동작합니다', 5000);
}
