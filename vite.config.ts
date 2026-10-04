import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? 'http://localhost:8000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/auth': { target: apiUrl, changeOrigin: true, secure: false },
        '/users': { target: apiUrl, changeOrigin: true, secure: false },
        '/v1/todos': { target: apiUrl, changeOrigin: true, secure: false },
      },
    },
  };
});