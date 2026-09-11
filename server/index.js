const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

const metadataRouter = require('./routes/metadata');

const app = express();
const PORT = 3001; // Vite(5173)가 이 포트로 proxy

// 현재 PC의 로컬 네트워크 IPv4 주소를 자동으로 탐색하는 함수
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.use(cors());
app.use(express.json());

// 정적 파일: 사운드, 햅틱, 관리자 (Vite가 /sounds, /haptics, /admin 경로를 이쪽으로 프록시)
app.use('/sounds', express.static(path.join(__dirname, '../sounds')));
app.use('/haptics', express.static(path.join(__dirname, '../haptics')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use('/models/datsun', express.static(path.join(__dirname, '../free_1972_datsun_240k_gt')));

// REST API
app.use('/api/metadata', metadataRouter);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

app.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`\n🛠  API 서버 실행 중 (포트 ${PORT})`);
  console.log(`   Vite 가 /api, /sounds, /haptics 를 이 서버로 프록시합니다.`);
  console.log(`   🌐 VR 클라이언트 (퀘스트): https://${localIp}:5173\n`);
});
