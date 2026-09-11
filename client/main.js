// ============================================================
// XR MetaData — main.js
// 상호작용 피드백, 햅틱/사운드 엔진 및 하이라이트 정상화
// ============================================================

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { createVRPanel } from './scene/vrUI.js';
import { playAudioSegment, preloadAudio } from './xr/audio.js';
import { playHaptic } from './xr/haptic.js';
import { fetchAllMetadata } from './services/metadataAPI.js';

// ─────────────────────────────────────────
// 1. 씬 / 카메라 / 렌더러
// ─────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 8, 30);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// ─────────────────────────────────────────
// 2. AudioContext 및 사용자 인터랙션 잠금 해제
// ─────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function unlockAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext 활성화 완료');
    }).catch(() => {});
  }
}

window.addEventListener('click', unlockAudio, true);
window.addEventListener('touchstart', unlockAudio, true);
window.addEventListener('touchend', unlockAudio, true);
renderer.xr.addEventListener('sessionstart', unlockAudio);

// ─────────────────────────────────────────
// 3. Three.js 공식 WebXR VRButton
// ─────────────────────────────────────────
const vrButton = VRButton.createButton(renderer);
vrButton.addEventListener('click', unlockAudio);
document.body.appendChild(vrButton);

// ─────────────────────────────────────────
// 4. 조명 & 환경
// ─────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 1.4);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 3.6);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);

const hemiLight = new THREE.HemisphereLight(0x4488ff, 0x001122, 0.5);
scene.add(hemiLight);

const grid = new THREE.GridHelper(20, 30, 0x222244, 0x111133);
scene.add(grid);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x0d0d1f, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

// ─────────────────────────────────────────
// 5. 전역 상태 & 캐시
// ─────────────────────────────────────────
const objectMeshes   = new Map(); // id → { group, meta }
const hapticCache    = new Map(); // url → json
const raycastTargets = [];        // 최적화된 충돌 판정용 가벼운 히트박스 목록
let vrPanel = null;
const controllers = [];
let hoveredObjectId = null;

// ─────────────────────────────────────────
// 6. 씬 빌드: 메타데이터 로드 & 사전 캐싱
// ─────────────────────────────────────────
async function buildScene() {
  try {
    const objects = await fetchAllMetadata();

    for (const obj of objects) {
      const pos = new THREE.Vector3(
        obj.position?.x ?? 0,
        obj.position?.y ?? 1.2,
        obj.position?.z ?? -3.5
      );
      const group = createCustomMesh(obj);
      group.position.copy(pos);
      scene.add(group);
      objectMeshes.set(obj.id, { group, meta: obj });

      // 폭발 쉐입 주변 은은한 포인트 라이트
      if (obj.id.startsWith('obj_explosion')) {
        const pl = new THREE.PointLight(parseInt(obj.color.replace('#', '0x')), 0.6, 1.5);
        pl.position.copy(pos);
        scene.add(pl);
      }

      // 사운드 사전 로딩
      if (obj.files?.mp3) {
        preloadAudio(audioCtx, '/' + obj.files.mp3).catch(() => {});
      }
      // 햅틱 JSON 사전 로딩
      if (obj.files?.haptic) {
        const url = '/' + obj.files.haptic;
        if (!hapticCache.has(url)) {
          fetch(url)
            .then(r => r.json())
            .then(d => hapticCache.set(url, d))
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('씬 로딩 중 오류:', err);
  } finally {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';

    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) infoPanel.classList.add('active');

    document.getElementById('panel-name').textContent = '오브젝트를 선택해 보세요';
    document.getElementById('panel-desc').textContent = 'VR에서는 컨트롤러 트리거, PC에서는 마우스 클릭으로 사운드와 진동이 재생됩니다.';
  }
}

// ─────────────────────────────────────────
// 7. 커스텀 쉐입 생성 (독립 매터리얼 & 발광 하이라이트 준비)
// ─────────────────────────────────────────
function setupHighlightData(mesh, color, boost = 0.8) {
  mesh.userData.baseEmissive = color.clone().multiplyScalar(0.12);
  mesh.userData.highlightEmissive = color.clone().multiplyScalar(boost);
}

function createCustomMesh(obj) {
  const group = new THREE.Group();
  group.userData.objectId = obj.id;

  const color = new THREE.Color(obj.color);

  function makeMaterial(rough = 0.25, metal = 0.4) {
    return new THREE.MeshStandardMaterial({
      color: color.clone(),
      roughness: rough,
      metalness: metal,
      emissive: color.clone().multiplyScalar(0.12),
    });
  }

  if (obj.id === 'obj_bubbling') {
    // 💧 물방울 묶음: 독립된 매터리얼로 색상 보존
    const m1 = makeMaterial(0.15, 0.2);
    const m2 = makeMaterial(0.15, 0.2);
    const m3 = makeMaterial(0.15, 0.2);

    const g1 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 32), m1);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), m2);
    g2.position.set(0.2, 0.22, 0.1);
    const g3 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), m3);
    g3.position.set(-0.16, 0.25, -0.1);

    setupHighlightData(g1, color, 0.9);
    setupHighlightData(g2, color, 0.9);
    setupHighlightData(g3, color, 0.9);

    group.add(g1, g2, g3);

  } else if (obj.id === 'obj_camera_snap') {
    // 📷 카메라
    const bodyMat = makeMaterial(0.3, 0.5);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), bodyMat);
    setupHighlightData(body, color, 0.9);

    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.1,
      metalness: 0.8,
      emissive: new THREE.Color(0x111111)
    });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 24), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.15;
    lens.userData.baseEmissive = new THREE.Color(0x111111);
    lens.userData.highlightEmissive = new THREE.Color(0x555555);

    const btnMat = makeMaterial(0.2, 0.7);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), btnMat);
    btn.position.set(0.15, 0.18, 0);
    setupHighlightData(btn, color, 0.9);

    group.add(body, lens, btn);

  } else if (obj.id === 'obj_firework') {
    // 🎇 폭죽
    const mat = makeMaterial(0.2, 0.6);
    const tk = new THREE.Mesh(new THREE.TorusKnotGeometry(0.18, 0.045, 80, 16), mat);
    setupHighlightData(tk, color, 0.9);
    group.add(tk);

  } else if (obj.id.startsWith('obj_explosion')) {
    // 💣 폭탄 (메타데이터 색상 몸통 + 도화선 불꽃)
    const bodyMat = makeMaterial(0.25, 0.4);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.23, 32, 32), bodyMat);
    setupHighlightData(body, color, 0.9);

    const neckMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, emissive: new THREE.Color(0x050505) });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 16), neckMat);
    neck.position.set(0, 0.23, 0);
    neck.userData.baseEmissive = new THREE.Color(0x050505);
    neck.userData.highlightEmissive = new THREE.Color(0x333333);

    const fuseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9, emissive: new THREE.Color(0x221105) });
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), fuseMat);
    fuse.position.set(0.04, 0.3, 0);
    fuse.rotation.z = -Math.PI / 6;
    fuse.userData.baseEmissive = new THREE.Color(0x221105);
    fuse.userData.highlightEmissive = new THREE.Color(0x663311);

    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), sparkMat);
    spark.position.set(0.085, 0.36, 0);

    group.add(body, neck, fuse, spark);

  } else if (obj.shape === 'gltf' || obj.id === 'obj_datsun') {
    // 🚗 외부 GLTF/GLB 3D 모델
    const modelUrl = obj.modelUrl || '/models/datsun/scene.gltf';
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // 크기(Scale) 및 중심점(Center) 자동 정규화
        const bbox = new THREE.Box3().setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // 전시용 적정 크기 (약 1.0m 너비)
        const targetSize = 1.0;
        const scaleFactor = targetSize / (maxDim || 1);
        model.scale.setScalar(scaleFactor);

        // 중심을 로컬 원점(0, 0, 0)으로 이동
        model.position.x = -center.x * scaleFactor;
        model.position.y = -center.y * scaleFactor;
        model.position.z = -center.z * scaleFactor;

        // 자동차 실제 치수에 딱 맞춘 직육면체 히트박스 생성 (허공 인식 방지)
        const carHitbox = new THREE.Mesh(
          new THREE.BoxGeometry(size.x * scaleFactor, size.y * scaleFactor, size.z * scaleFactor),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        carHitbox.userData.isHitbox = true;
        carHitbox.userData.objectId = obj.id;
        group.add(carHitbox);
        raycastTargets.push(carHitbox);

        // 고폴리곤 자식 메쉬들의 레이캐스팅 차단 및 원래 색상 보존 매터리얼 복제
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.raycast = () => {}; // 렉 방지
            child.userData.objectId = obj.id;

            if (Array.isArray(child.material)) {
              child.material = child.material.map(m => m.clone());
              child.userData.baseEmissive = child.material.map(m => (m.emissive ? m.emissive.clone() : new THREE.Color(0, 0, 0)));
              child.userData.highlightEmissive = child.material.map(() => new THREE.Color(0x555555));
            } else {
              child.material = child.material.clone();
              child.userData.baseEmissive = child.material.emissive ? child.material.emissive.clone() : new THREE.Color(0, 0, 0);
              child.userData.highlightEmissive = new THREE.Color(0x555555);
            }
          }
        });

        group.add(model);
      },
      undefined,
      (err) => {
        console.error(`[GLTF] 모델 로드 실패 (${modelUrl}):`, err);
      }
    );

  } else if (obj.shape === 'box') {
    // 📦 상자
    const mat = makeMaterial(0.3, 0.4);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
    setupHighlightData(box, color, 0.9);
    group.add(box);

  } else if (obj.shape === 'cylinder') {
    // 🥫 실린더
    const mat = makeMaterial(0.25, 0.4);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 24), mat);
    setupHighlightData(cyl, color, 0.9);
    group.add(cyl);

  } else {
    // 🔮 구 (기본 형태)
    const mat = makeMaterial(0.2, 0.3);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 32), mat);
    setupHighlightData(sph, color, 0.9);
    group.add(sph);
  }

  // 글자 라벨 (스프라이트 레이캐스트 제외)
  const labelY = (obj.shape === 'gltf' || obj.id === 'obj_datsun') ? 0.65 : 0.5;
  group.add(makeLabel(obj.name, new THREE.Vector3(0, labelY, 0)));

  // 일반 오브젝트용 투명 구형 히트박스 (GLTF는 맞춤형 BoxGeometry 히트박스를 위에서 별도 생성)
  if (obj.shape !== 'gltf' && obj.id !== 'obj_datsun') {
    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.userData.isHitbox = true;
    hitbox.userData.objectId = obj.id;
    group.add(hitbox);
    raycastTargets.push(hitbox);
  }

  // 모든 자식에 objectId 전파
  group.traverse(c => { c.userData.objectId = obj.id; });

  return group;
}

function makeLabel(text, pos) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 42);

  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  sp.position.copy(pos);
  sp.scale.set(1.2, 0.3, 1);
  sp.raycast = () => {}; // 스프라이트 레이캐스트 충돌 원천 차단
  return sp;
}

// ─────────────────────────────────────────
// 8. XR 컨트롤러 설정 & 레이저 포인터
// ─────────────────────────────────────────
const raycaster  = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();

function setupControllers() {
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    ctrl.addEventListener('selectstart', onSelectStart);
    scene.add(ctrl);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]),
      new THREE.LineBasicMaterial({ color: 0x00BFFF, transparent: true, opacity: 0.85 })
    );
    line.name = 'ray';
    line.scale.z = 10;
    ctrl.add(line);

    const cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00FF88 })
    );
    cursor.name = 'cursor';
    cursor.visible = false;
    scene.add(cursor);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(controllerModelFactory.createControllerModel(grip));
    scene.add(grip);

    controllers.push({ ctrl, line, cursor });
  }
}

function castRay(controller) {
  controller.updateMatrixWorld();
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  raycaster.camera = camera;

  // 초고속 히트박스 레이캐스팅: 수십만 개 메쉬 대신 가벼운 히트박스만 단일 레벨 검사
  const hits = raycaster.intersectObjects(raycastTargets, false);
  return hits[0] ?? null;
}

function getObjectId(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData?.objectId) return cur.userData.objectId;
    cur = cur.parent;
  }
  return null;
}

// ─────────────────────────────────────────
// 9. 인터랙션 처리 (선택 즉시 반응)
// ─────────────────────────────────────────
function onSelectStart(event) {
  unlockAudio();
  const controller = event.target;
  const hit = castRay(controller);
  if (hit) {
    const objectId = getObjectId(hit.object);
    if (objectId) {
      handleSelect(objectId, controller, event.data);
    }
  }
}

// PC 마우스 클릭 지원
const mouse = new THREE.Vector2();
const mouseRay = new THREE.Raycaster();
renderer.domElement.addEventListener('click', e => {
  unlockAudio();
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouseRay.setFromCamera(mouse, camera);
  const hits = mouseRay.intersectObjects(raycastTargets, false);
  if (hits[0]) {
    const objectId = getObjectId(hits[0].object);
    if (objectId) handleSelect(objectId, null, null);
  }
});

async function handleSelect(objectId, controller, inputSource) {
  if (!objectId) return;
  const entry = objectMeshes.get(objectId);
  if (!entry) return;
  const { group, meta } = entry;

  // 1. 펄스 스케일 피드백 (눌렸을 때 통통 튀는 느낌)
  group.scale.setScalar(1.18);
  setTimeout(() => group.scale.setScalar(1.0), 160);

  // 2. 원래 고유 색상 기반의 부드러운 발광 플래시
  flashGroupHighlight(group);

  // 3. UI 패널 텍스트 갱신
  updateInfoPanel(meta);

  // 4. VR 3D 정보창
  if (renderer.xr.isPresenting) {
    if (vrPanel) scene.remove(vrPanel);
    vrPanel = createVRPanel(meta);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    vrPanel.position.copy(camera.position).addScaledVector(dir, 1.5);
    vrPanel.position.y = camera.position.y + 0.1;
    vrPanel.lookAt(camera.position);
    scene.add(vrPanel);
  }

  const start = meta.hapticParams?.segmentStart ?? 0;
  const end   = meta.hapticParams?.segmentEnd   ?? null;

  // 5. 오디오 사운드 재생 (정확한 구간 전달)
  if (meta.files?.mp3) {
    playAudioSegment(audioCtx, '/' + meta.files.mp3, start, end);
  }

  // 6. 햅틱 진동 재생 (메타 퀘스트 LRA 모터 60ms 슬라이스)
  if (meta.files?.haptic) {
    const url = '/' + meta.files.haptic;
    const session = renderer.xr.getSession();
    if (session) {
      let hapticData = hapticCache.get(url);
      if (!hapticData) {
        try {
          hapticData = await fetch(url).then(r => r.json());
          hapticCache.set(url, hapticData);
        } catch (e) {
          console.warn('햅틱 다운로드 실패:', e);
        }
      }
      if (hapticData) {
        playHaptic(session, hapticData, start, end, inputSource);
      }
    }
  }
}

// ─────────────────────────────────────────
// 10. 오브젝트 발광 하이라이트 (절대 하얗게 남지 않는 안전 복원)
// ─────────────────────────────────────────
function flashGroupHighlight(group) {
  group.traverse(c => {
    if (c.isMesh && !c.userData.isHitbox && c.material) {
      if (Array.isArray(c.material)) {
        c.material.forEach((mat, idx) => {
          if (mat.emissive && c.userData.highlightEmissive?.[idx]) {
            mat.emissive.copy(c.userData.highlightEmissive[idx]);
          }
        });
        setTimeout(() => {
          c.material.forEach((mat, idx) => {
            if (mat.emissive && c.userData.baseEmissive?.[idx]) {
              mat.emissive.copy(c.userData.baseEmissive[idx]);
            }
          });
        }, 250);
      } else {
        if (c.userData.baseEmissive && c.userData.highlightEmissive && c.material.emissive) {
          c.material.emissive.copy(c.userData.highlightEmissive);
          setTimeout(() => {
            c.material.emissive.copy(c.userData.baseEmissive);
          }, 250);
        }
      }
    }
  });
}

// ─────────────────────────────────────────
// 11. PC 정보 패널 텍스트
// ─────────────────────────────────────────
function updateInfoPanel(meta) {
  document.getElementById('panel-name').textContent = meta.name;
  const mp3    = meta.files?.mp3    ? `🔊 ${meta.files.mp3}`    : '─';
  const haptic = meta.files?.haptic ? `📳 ${meta.files.haptic}` : '─';
  const seg    = meta.hapticParams?.segmentStart != null
    ? ` | 구간: ${meta.hapticParams.segmentStart}s ~ ${meta.hapticParams.segmentEnd ?? '끝'}s`
    : '';
  document.getElementById('panel-desc').innerHTML =
    `${meta.description || ''}<br>${mp3}&nbsp; ${haptic}${seg}`;
}

// ─────────────────────────────────────────
// 12. 렌더 루프
// ─────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  renderer.setAnimationLoop(() => {
    try {
      const t = clock.getElapsedTime();

      // 오브젝트 애니메이션 (회전 및 호버링)
      for (const [id, { group }] of objectMeshes) {
        group.rotation.y += 0.003;
        if (id.startsWith('obj_explosion')) {
          group.position.y = 1.2 + Math.sin(t * 1.6 + (group.userData.phase || 0)) * 0.07;
        }
      }

      // VR 레이저 조준 & 호버 피드백
      if (renderer.xr.isPresenting) {
        let hitId = null;
        for (const { ctrl, line, cursor } of controllers) {
          const hit = castRay(ctrl);
          if (hit) {
            hitId = getObjectId(hit.object);
            line.material.color.setHex(0x00FF88);
            line.scale.z = hit.distance;
            cursor.visible = true;
            cursor.position.copy(hit.point);
          } else {
            line.material.color.setHex(0x00BFFF);
            line.scale.z = 10;
            cursor.visible = false;
          }
        }
        if (hitId !== hoveredObjectId) {
          if (hoveredObjectId && objectMeshes.has(hoveredObjectId))
            objectMeshes.get(hoveredObjectId).group.scale.setScalar(1.0);
          if (hitId && objectMeshes.has(hitId))
            objectMeshes.get(hitId).group.scale.setScalar(1.1);
          hoveredObjectId = hitId;
        }
      }

      renderer.render(scene, camera);
    } catch (e) {
      console.error('XR RenderLoop Error:', e);
      try { renderer.render(scene, camera); } catch (_) {}
    }
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────
// 시작
// ─────────────────────────────────────────
(async () => {
  await buildScene();

  let pi = 0;
  for (const [id, { group }] of objectMeshes) {
    if (id.startsWith('obj_explosion'))
      group.userData.phase = pi++ * (Math.PI * 2 / 5);
  }

  setupControllers();
  animate();
})();
