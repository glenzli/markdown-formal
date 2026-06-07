import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'out/cli',
        emptyOutDir: false,
        target: 'es2022',
        sourcemap: false,
        minify: false,
        lib: {
            entry: {
                'formal-tools': 'src/cli/formal-tools.ts',
                release: 'src/cli/release.ts'
            },
            formats: ['cjs'],
            fileName: (_format, entryName) => `${entryName}.js`
        },
        rollupOptions: {
            external: [/^node:/]
        }
    }
});
