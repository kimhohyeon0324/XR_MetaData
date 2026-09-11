const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/metadata.json');

function readData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/metadata — 전체 오브젝트 목록
router.get('/', (req, res) => {
  const data = readData();
  res.json(data.objects);
});

// GET /api/metadata/:id — 특정 오브젝트 조회
router.get('/:id', (req, res) => {
  const data = readData();
  const obj = data.objects.find(o => o.id === req.params.id);
  if (!obj) return res.status(404).json({ error: '오브젝트를 찾을 수 없습니다.' });
  res.json(obj);
});

// POST /api/metadata — 새 오브젝트 생성
router.post('/', (req, res) => {
  const data = readData();

  // 기존 오브젝트들 중 가장 오른쪽 X 좌표 옆으로 자동 일렬 배치
  let nextX = 0;
  if (data.objects && data.objects.length > 0) {
    const xValues = data.objects.map(o => (o.position?.x != null ? o.position.x : 0));
    const maxX = Math.max(...xValues);
    nextX = parseFloat((maxX + 1.2).toFixed(2));
  }

  const newObj = {
    ...req.body,
    position: req.body.position || { x: nextX, y: 1.2, z: -3.5 },
    scale: req.body.scale || { x: 0.4, y: 0.4, z: 0.4 },
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    history: []
  };
  data.objects.push(newObj);
  writeData(data);
  res.status(201).json(newObj);
});

// PUT /api/metadata/:id — 오브젝트 수정
router.put('/:id', (req, res) => {
  const data = readData();
  const idx = data.objects.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '오브젝트를 찾을 수 없습니다.' });

  const old = data.objects[idx];
  // 수정 기록 추가
  const historyEntry = {
    timestamp: new Date().toISOString(),
    modifiedBy: req.body.modifiedBy || 'unknown',
    changes: Object.keys(req.body).filter(k => k !== 'modifiedBy')
  };

  data.objects[idx] = {
    ...old,
    ...req.body,
    id: old.id, // id 변경 불가
    createdAt: old.createdAt,
    modifiedAt: new Date().toISOString(),
    history: [...(old.history || []), historyEntry]
  };

  writeData(data);
  res.json(data.objects[idx]);
});

// DELETE /api/metadata/:id — 오브젝트 삭제
router.delete('/:id', (req, res) => {
  const data = readData();
  const idx = data.objects.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '오브젝트를 찾을 수 없습니다.' });
  data.objects.splice(idx, 1);
  writeData(data);
  res.json({ message: '삭제되었습니다.' });
});

module.exports = router;
