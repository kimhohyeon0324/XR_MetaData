// ============================================================
// vrUI.js — VR 내 3D 메타데이터 패널 생성
// ============================================================

import * as THREE from 'three';

/**
 * 오브젝트 메타데이터를 표시하는 VR 내 3D 패널을 생성합니다.
 * @param {object} meta — 메타데이터 객체
 * @returns {THREE.Group}
 */
export function createVRPanel(meta) {
  const group = new THREE.Group();

  // 패널 배경
  const bgGeo = new THREE.PlaneGeometry(0.6, 0.4);
  const bgMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a1a,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  const bg = new THREE.Mesh(bgGeo, bgMat);
  group.add(bg);

  // 테두리 (라인 박스)
  const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.6, 0.4));
  const borderMat = new THREE.LineBasicMaterial({ color: 0x00BFFF });
  const border = new THREE.LineSegments(borderGeo, borderMat);
  border.position.z = 0.001;
  group.add(border);

  // 텍스트 캔버스
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');

  // 배경 투명
  ctx.clearRect(0, 0, 512, 340);

  // 제목
  ctx.fillStyle = '#00BFFF';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(meta.name, 20, 42);

  // 구분선
  ctx.strokeStyle = '#333355';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 55); ctx.lineTo(490, 55);
  ctx.stroke();

  // 본문
  ctx.fillStyle = '#cccccc';
  ctx.font = '20px Arial';

  const lines = [
    `설명: ${meta.description || '─'}`,
    `MP3:  ${meta.files?.mp3 ? meta.files.mp3.split('/').pop() : '없음'}`,
    `HAP:  ${meta.files?.haptic ? meta.files.haptic.split('/').pop() : '없음'}`,
  ];

  if (meta.hapticParams?.segmentStart != null) {
    lines.push(`구간: ${meta.hapticParams.segmentStart}s ~ ${meta.hapticParams.segmentEnd ?? '끝'}s`);
  }
  if (meta.notes) lines.push(`메모: ${meta.notes.substring(0, 35)}…`);
  lines.push(`생성: ${meta.createdBy}  /  수정: ${meta.modifiedBy}`);

  lines.forEach((line, i) => {
    ctx.fillText(line, 20, 90 + i * 36);
  });

  // 태그
  if (meta.tags?.length > 0) {
    ctx.fillStyle = '#4488ff';
    ctx.font = '17px Arial';
    ctx.fillText('#' + meta.tags.join('  #'), 20, 90 + lines.length * 36 + 10);
  }

  const tex = new THREE.CanvasTexture(canvas);
  const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.38), textMat);
  textMesh.position.z = 0.002;
  group.add(textMesh);

  return group;
}
