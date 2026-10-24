import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * After the build, writes the list of emitted files into dist/sw.js so the service worker can precache the whole
 * app shell. That is what makes the app load offline after the first visit.
 */
function precacheManifest(): Plugin {
  const walk = (dir: string, base = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`],
    );
  return {
    name: 'precache-manifest',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const swPath = join(dist, 'sw.js');
      if (!existsSync(swPath)) return;
      const files = walk(dist)
        .filter((f) => f !== 'sw.js' && f !== '_redirects' && !f.endsWith('.map'))
        .map((f) => `/${f}`);
      const placeholder = '/*__PRECACHE_ASSETS__*/[]';
      const source = readFileSync(swPath, 'utf8');
      if (!source.includes(placeholder)) throw new Error('sw.js is missing the precache placeholder');
      writeFileSync(swPath, source.replace(placeholder, JSON.stringify(files)));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), precacheManifest()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split big libraries into their own files: they change rarely, so browsers (and the service worker) reuse them.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//.test(id)) return 'vendor-react';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('@supabase') || id.includes('isows') || id.includes('whatwg-url') || id.includes('tr46')) return 'vendor-supabase';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
