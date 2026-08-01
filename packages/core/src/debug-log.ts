import * as fs from 'fs';
import * as path from 'path';

export function previewDebugLogEnabled(config: any): boolean {
    return config?.debug?.previewLog === true;
}

function safeDetails(details: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(details).map(([key, value]) => {
        if (value instanceof Error) return [key, { name: value.name, message: value.message, stack: value.stack }];
        if (typeof value === 'bigint') return [key, String(value)];
        return [key, value];
    }));
}

export function appendPreviewDebugLog(rootPath: string, config: any, event: string, details: Record<string, unknown> = {}) {
    if (!rootPath || !previewDebugLogEnabled(config)) return;

    try {
        const cacheDir = path.join(rootPath, '.markdown-formal');
        fs.mkdirSync(cacheDir, { recursive: true });
        const payload = {
            time: new Date().toISOString(),
            event,
            ...safeDetails(details)
        };
        fs.appendFileSync(path.join(cacheDir, 'preview-debug.log'), `${JSON.stringify(payload)}\n`, 'utf8');
    } catch (_err) {
        // Debug logging must never break preview rendering.
    }
}
