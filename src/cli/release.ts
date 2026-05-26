import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');

async function readJson(filePath: string): Promise<any> {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (_err) {
        return false;
    }
}

async function cleanDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
}

async function copyFile(src: string, dest: string): Promise<void> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
}

async function copyDir(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            await copyFile(srcPath, destPath);
        }
    }
}

async function copySelectedOutFiles(destOut: string): Promise<void> {
    await copyFile(path.join(ROOT, 'out', 'extension.js'), path.join(destOut, 'extension.js'));
    await copyFile(path.join(ROOT, 'out', 'markdown-it-formal.js'), path.join(destOut, 'markdown-it-formal.js'));
    await copyFile(path.join(ROOT, 'out', 'core', 'formal-core.js'), path.join(destOut, 'core', 'formal-core.js'));
}

async function writeJson(filePath: string, value: any): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeExtensionPackageJson(pkg: any): any {
    return {
        name: pkg.name,
        displayName: pkg.displayName,
        description: pkg.description,
        version: pkg.version,
        publisher: pkg.publisher,
        engines: pkg.engines,
        activationEvents: pkg.activationEvents,
        main: pkg.main,
        contributes: pkg.contributes
    };
}

function makeCliPackageJson(pkg: any): any {
    return {
        name: `${pkg.name}-cli`,
        version: pkg.version,
        private: true,
        description: 'CLI artifacts for markdown-formal',
        scripts: {
            formal: 'node out/cli/formal-tools.js'
        }
    };
}

async function requiredPath(filePath: string): Promise<void> {
    if (!(await pathExists(filePath))) {
        throw new Error(`Missing required release input: ${path.relative(ROOT, filePath)}`);
    }
}

async function collectFiles(dir: string): Promise<string[]> {
    const result: string[] = [];
    async function walk(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile()) {
                result.push(fullPath);
            }
        }
    }
    await walk(dir);
    return result.sort((a, b) => toPosix(path.relative(dir, a)).localeCompare(toPosix(path.relative(dir, b))));
}

function toPosix(filePath: string): string {
    return filePath.split(path.sep).join('/');
}

async function sha256(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    hash.update(await fs.readFile(filePath));
    return hash.digest('hex');
}

async function writeChecksums(releaseRoot: string): Promise<void> {
    const files = await collectFiles(releaseRoot);
    const lines = [];
    for (const file of files) {
        const rel = toPosix(path.relative(releaseRoot, file));
        if (rel === 'checksums.txt') continue;
        lines.push(`${await sha256(file)}  ${rel}`);
    }
    await fs.writeFile(path.join(releaseRoot, 'checksums.txt'), `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
    const pkg = await readJson(path.join(ROOT, 'package.json'));
    const releaseName = `${pkg.name}-${pkg.version}`;
    const releaseRoot = path.join(DIST_DIR, releaseName);
    const extensionRoot = path.join(releaseRoot, 'extension');
    const cliRoot = path.join(releaseRoot, 'cli');

    await requiredPath(path.join(ROOT, 'out', 'extension.js'));
    await requiredPath(path.join(ROOT, 'out', 'markdown-it-formal.js'));
    await requiredPath(path.join(ROOT, 'out', 'core', 'formal-core.js'));
    await requiredPath(path.join(ROOT, 'out', 'cli', 'formal-tools.js'));
    await requiredPath(path.join(ROOT, 'media', 'formal-script.js'));
    await requiredPath(path.join(ROOT, 'media', 'styles.css'));

    await cleanDir(releaseRoot);

    await writeJson(path.join(extensionRoot, 'package.json'), makeExtensionPackageJson(pkg));
    await copySelectedOutFiles(path.join(extensionRoot, 'out'));
    await copyDir(path.join(ROOT, 'media'), path.join(extensionRoot, 'media'));
    await copyDir(path.join(ROOT, 'skills'), path.join(extensionRoot, 'skills'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(extensionRoot, 'LICENSE'));

    await writeJson(path.join(cliRoot, 'package.json'), makeCliPackageJson(pkg));
    await copyDir(path.join(ROOT, 'out', 'cli'), path.join(cliRoot, 'out', 'cli'));
    await copyDir(path.join(ROOT, 'out', 'core'), path.join(cliRoot, 'out', 'core'));
    await copyDir(path.join(ROOT, 'skills'), path.join(cliRoot, 'skills'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(cliRoot, 'LICENSE'));

    await writeJson(path.join(releaseRoot, 'manifest.json'), {
        name: pkg.name,
        version: pkg.version,
        generatedAt: new Date().toISOString(),
        artifacts: {
            extension: {
                path: 'extension',
                entry: 'out/extension.js',
                install: 'Copy this directory to the editor extensions directory or package it as VSIX later.'
            },
            cli: {
                path: 'cli',
                entry: 'out/cli/formal-tools.js',
                install: 'Copy this directory into tools/markdown-formal and run node tools/markdown-formal/out/cli/formal-tools.js.'
            },
            skills: {
                extensionPath: 'extension/skills',
                cliPath: 'cli/skills',
                mode: 'repo-local copy; do not auto-install from remote sources'
            }
        }
    });

    await writeChecksums(releaseRoot);

    console.log(`OK release: ${toPosix(path.relative(ROOT, releaseRoot))}`);
    console.log(`Manifest: ${toPosix(path.relative(ROOT, path.join(releaseRoot, 'manifest.json')))}`);
    console.log(`Checksums: ${toPosix(path.relative(ROOT, path.join(releaseRoot, 'checksums.txt')))}`);
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
});
