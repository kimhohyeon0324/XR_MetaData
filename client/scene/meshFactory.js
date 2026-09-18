import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. 발광 하이라이트 색상 저장 보조 함수
function setupHighlightData(mesh, color, boost = 0.8) {
  mesh.userData.baseEmissive = color.clone().multiplyScalar(0.12);
  mesh.userData.highlightEmissive = color.clone().multiplyScalar(boost);
}

// 2. 머리 위에 뜨는 글자 라벨 생성
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
  sp.raycast = () => {}; // 스프라이트 레이캐스트 충돌 차단
  return sp;
}

// 3. 메인 메쉬 조립 함수 (외부로 공개)
export function createCustomMesh(obj, raycastTargets) {
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
    // 💧 물방울 묶음
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

    const lensMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.8, emissive: new THREE.Color(0x111111) });
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
    // 💣 폭탄
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
    // 🚗 외부 GLTF 3D 모델
    const modelUrl = obj.modelUrl || '/models/datsun/scene.gltf';
    const loader = new GLTFLoader();
    loader.load(modelUrl, (gltf) => {
      const model = gltf.scene;
      //260918 day02 review : 외부 에셋의 크기로 부터 동일한 스케일의 히트박스 육면체를 생성하여 연산 효율을 높임, 히트박스를 부모group에 넣어 모델의 변환행렬이 히트박스에도 적용 되도록 함
      // 축 정렬 바운딩 박스 크기 및 중심 추출
      const bbox = new THREE.Box3().setFromObject(model);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // 씬 내 일관된 스케일 규격화 및 피벗 원점 정렬
      const targetSize = 1.0;
      const scaleFactor = targetSize / (maxDim || 1);
      model.scale.setScalar(scaleFactor);

      model.position.x = -center.x * scaleFactor; // 부모 group의 중심점과 모델의 중심점을 일치시킴
      model.position.y = -center.y * scaleFactor;
      model.position.z = -center.z * scaleFactor;
      
      // 단일 투명 히트박스 지오메트리 생성 및 바인딩
      const carHitbox = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * scaleFactor, size.y * scaleFactor, size.z * scaleFactor), // 불러온 모델의 크기와 일치하는 박스를 생성
        new THREE.MeshBasicMaterial({ visible: false }) // 렌더시 화면에 보이지 않도록
      );
      carHitbox.userData.isHitbox = true;
      carHitbox.userData.objectId = obj.id;
      group.add(carHitbox); // 히트박스를 Datsun 메쉬의 부모인 group에 자식 노드로 묶음
      if (raycastTargets) raycastTargets.push(carHitbox); // 컨트롤러 광선은 박스만 연산함

      model.traverse((child) => {
        if (child.isMesh && child.material) {
          child.raycast = () => {};
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
    });

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

  const labelY = (obj.shape === 'gltf' || obj.id === 'obj_datsun') ? 0.65 : 0.5;
  group.add(makeLabel(obj.name, new THREE.Vector3(0, labelY, 0)));

  if (obj.shape !== 'gltf' && obj.id !== 'obj_datsun') {
    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.userData.isHitbox = true;
    hitbox.userData.objectId = obj.id;
    group.add(hitbox);
    if (raycastTargets) raycastTargets.push(hitbox);
  }

  group.traverse(c => { c.userData.objectId = obj.id; });
  return group;
}