import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  root: 'client',
  server: {
    port: 5173,
    host: '0.0.0.0',   // 퀘스트 등 외부 기기 접속 허용
    proxy: {
      '/api':    { target: 'http://localhost:3001', changeOrigin: true },
      '/sounds': { target: 'http://localhost:3001', changeOrigin: true },
      '/haptics':{ target: 'http://localhost:3001', changeOrigin: true },
      '/admin':  { target: 'http://localhost:3001', changeOrigin: true },
      '/models': { target: 'http://localhost:3001', changeOrigin: true },
    }
  }
});
