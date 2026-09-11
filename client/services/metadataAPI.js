// ============================================================
// metadataAPI.js — REST API 호출 유틸리티
// ============================================================

const API_BASE = '/api/metadata';

export async function fetchAllMetadata() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error('메타데이터 목록 조회 실패');
  return res.json();
}

export async function fetchMetadata(id) {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error(`메타데이터 조회 실패: ${id}`);
  return res.json();
}

export async function createMetadata(data) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('메타데이터 생성 실패');
  return res.json();
}

export async function updateMetadata(id, data) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`메타데이터 수정 실패: ${id}`);
  return res.json();
}

export async function deleteMetadata(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`메타데이터 삭제 실패: ${id}`);
  return res.json();
}
