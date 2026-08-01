import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'packages/core/out',
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: false,
        minify: false,
        lib: {
            entry: 'packages/core/src/formal-core.ts',
            formats: ['cjs'],
            fileName: () => 'formal-core.js'
        },
        rollupOptions: {
            external: [/^node:/]
        }
    }
});
