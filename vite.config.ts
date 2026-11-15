import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages เป็น project site ที่ https://it-sccb.github.io/my-triton/
    // จึงต้อง build ด้วย base '/my-triton/' (ตั้ง VITE_PAGES_BUILD=true ตอน build)
    // ส่วนโหมดอื่น (AI Studio / Cloud Run / dev) ใช้ base '/' เหมือนเดิม
    base: process.env.VITE_PAGES_BUILD === 'true' ? '/my-triton/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
