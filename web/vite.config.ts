import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

function prerenderedPreview(): Plugin {
  return {
    name: 'prerendered-preview',
    configurePreviewServer(server) {
      const outputDir = resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((request, _response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next();
        const accept = request.headers.accept;
        if (accept && !accept.includes('text/html') && !accept.includes('*/*')) return next();
        const url = new URL(request.url ?? '/', 'http://localhost');
        let pathname: string;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          return next();
        }
        if (extname(pathname)) return next();
        const documentPath = resolve(outputDir, `.${pathname}`, 'index.html');
        const prerendered = documentPath.startsWith(`${outputDir}${sep}`) && existsSync(documentPath);
        request.url = `${prerendered ? `${url.pathname.replace(/\/$/, '')}/index.html` : '/spa.html'}${url.search}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), prerenderedPreview()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@data': resolve(__dirname, '../data'),
    },
  },
  build: {
    assetsInlineLimit: 0,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 3000,
    allowedHosts: ['brufury'],
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
  test: {
    exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
