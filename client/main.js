// ============================================================
// XR MetaData — main.js
// 상호작용 피드백, 햅틱/사운드 엔진 및 하이라이트 정상화
// ============================================================

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

import { createVRPanel } from './scene/vrUI.js';
import { playAudioSegment, preloadAudio } from './xr/audio.js';
import { playHaptic } from './xr/haptic.js';
import { fetchAllMetadata } from './services/metadataAPI.js';
import { createCustomMesh } from './scene/meshFactory.js';

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
let isProcessingClick = false;

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
      const group = createCustomMesh(obj, raycastTargets);
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
// 7. XR 컨트롤러 설정 & 레이저 포인터
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

//260917 day01 review : 하이폴리 메쉬 직접 순회 시 발생하는 삼각형 루프 병목을 방지, 단일 히트박스만 검사하여 프레임 레이턴시를 방어 
function castRay(controller) {
  // review: 현재 프레임 컨트롤러의 최신 트랜스폼을 행렬에 즉시 동기화 (누락 시: 컨트롤러 움직임이 1프레임 늦게 따라오는 래그 발생)
  controller.updateMatrixWorld();

  // 회전 성분만 분리하여 -Z 전방 벡터에 적용 (누락 시: 위치 이동 값이 방향 벡터에 간섭되어 광선 각도 왜곡, 광선이 전방을 향하도록)
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  raycaster.camera = camera;

  // carHitbox 단일 레벨만 검사 (두 번째 인자가 true이거나 원본 메쉬를 검사할 경우 - 수만개 삼각형 루프로 인해 메인 스레드 병목 발생)
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
// 8. 인터랙션 처리 (선택 즉시 반응)
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
  if(isProcessingClick) return;
  isProcessingClick = true;
  
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

  setTimeout(() => {
    isProcessingClick = false;
  }, 350);
}

// ─────────────────────────────────────────
// 9. 오브젝트 발광 하이라이트 (절대 하얗게 남지 않는 안전 복원)
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
// 10. PC 정보 패널 텍스트
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
// 11. 렌더 루프
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
