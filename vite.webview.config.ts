import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'media',
        emptyOutDir: false,
        target: 'es2022',
        sourcemap: false,
        minify: false,
        lib: {
            entry: 'src/webview/formal-script.ts',
            name: 'MarkdownFormalPreview',
            formats: ['iife'],
            fileName: () => 'formal-script.js'
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: true
            }
        }
    }
});
