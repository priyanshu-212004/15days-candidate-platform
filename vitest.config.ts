import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Vitest doesn't have Next.js's server/client webpack compiler split,
      // so the real `server-only` package (which unconditionally throws)
      // would fire even for legitimate server-side unit tests. Next.js's
      // own webpack config resolves `server-only` to this same package's
      // no-op `empty.js` when bundling server code — this alias mirrors
      // that exactly, scoped to the test runner only. Production builds are
      // untouched: Next still uses the real throwing module for any client
      // bundle that mistakenly imports a server-only module, so the
      // protection this guards against is fully intact outside tests.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
