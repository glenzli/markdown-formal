import * as path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    resolve: {
        alias: [
            {
                find: '@markdown-formal/core/debug-log',
                replacement: path.resolve(__dirname, 'packages/core/src/debug-log.ts')
            },
            {
                find: '@markdown-formal/core',
                replacement: path.resolve(__dirname, 'packages/core/src/formal-core.ts')
            }
        ]
    },
    build: {
        outDir: 'packages/vscode-extension/out',
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: false,
        minify: false,
        lib: {
            entry: 'packages/vscode-extension/src/extension.ts',
            formats: ['cjs'],
            fileName: () => 'extension.js'
        },
        rollupOptions: {
            external: [
                /^(?:node:)?(?:assert|buffer|child_process|crypto|events|fs|http|module|os|path|stream|url|util|zlib)(?:\/.*)?$/,
                'vscode'
            ]
        }
    }
});
