import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const { spawnSync } = require('node:child_process');

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

async function copyDirIfExists(src: string, dest: string): Promise<void> {
    if (await pathExists(src)) {
        await copyDir(src, dest);
    }
}

async function copySelectedOutFiles(destOut: string): Promise<void> {
    await copyFile(path.join(ROOT, 'out', 'extension.js'), path.join(destOut, 'extension.js'));
    await copyFile(path.join(ROOT, 'out', 'markdown-it-formal.js'), path.join(destOut, 'markdown-it-formal.js'));
    await copyFile(path.join(ROOT, 'out', 'core', 'debug-log.js'), path.join(destOut, 'core', 'debug-log.js'));
    await copyFile(path.join(ROOT, 'out', 'core', 'formal-core.js'), path.join(destOut, 'core', 'formal-core.js'));
}

async function writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
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
        license: pkg.license,
        repository: pkg.repository,
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
        license: pkg.license,
        repository: pkg.repository,
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

function localBin(name: string): string {
    return path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

function runCommand(command: string, args: string[], cwd: string): void {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${path.basename(command)} ${args.join(' ')} failed with exit code ${result.status}`);
    }
}

async function packageVsix(releaseRoot: string, pkg: any): Promise<string> {
    const vsceBin = localBin('vsce');
    await requiredPath(vsceBin);
    const vsixName = `${pkg.name}-${pkg.version}.vsix`;
    const vsixPath = path.join(releaseRoot, vsixName);
    runCommand(vsceBin, ['package', '--no-dependencies', '--out', vsixPath], ROOT);
    return vsixName;
}

function releaseInstallDoc(pkg: any, vsixName: string): string {
    return `# ${pkg.displayName || pkg.name} ${pkg.version}

Language: [English](#english) | [中文](#中文)

<a id="english"></a>

## English

This release bundle contains the editor extension, the CLI runtime, documentation, and AI-facing workflow files.

### Artifacts

- \`${vsixName}\`: VS Code-compatible extension package.
- \`extension/\`: unpacked extension directory for local editor extension folders.
- \`cli/\`: dependency-free CLI runtime for target projects.
- \`skills/\`: reviewed AI integration source material.
- \`docs/\`: usage, AI integration, and release documentation.
- \`manifest.json\`: machine-readable artifact map.
- \`checksums.txt\`: SHA-256 checksums.

### Install Extension

\`\`\`bash
code --install-extension ${vsixName}
\`\`\`

For local development, prefer a symlink to the repository or copy \`extension/\` into the editor extension directory. Then run \`Developer: Reload Window\`.

### Vendor CLI

\`\`\`bash
mkdir -p tools/markdown-formal
cp -R cli/* tools/markdown-formal/
\`\`\`

Then add a project script:

\`\`\`json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
\`\`\`

Run \`npm run formal -- prepare\` from the project root that owns \`.markdown-formal/config.json\`.

### AI Integration

Review \`skills/editor.md\` and \`skills/integrator.md\`, then merge the rules into the target project's native AI instructions. Do not auto-install or auto-update skills from an untrusted remote source.

<a id="中文"></a>

## 中文

这个 release 包包含编辑器扩展、CLI 运行时、文档和面向 AI 的工作流规则。

### 产物

- \`${vsixName}\`：VS Code 兼容扩展安装包。
- \`extension/\`：可复制到本地编辑器扩展目录的解包版本。
- \`cli/\`：目标项目使用的无运行时依赖 CLI。
- \`skills/\`：需要审阅和融合的 AI 集成规则材料。
- \`docs/\`：使用、AI 集成和 release 文档。
- \`manifest.json\`：机器可读产物表。
- \`checksums.txt\`：SHA-256 校验和。

### 安装扩展

\`\`\`bash
code --install-extension ${vsixName}
\`\`\`

本地开发优先使用软链接，或把 \`extension/\` 复制到编辑器扩展目录。之后执行 \`Developer: Reload Window\`。

### Vendoring CLI

\`\`\`bash
mkdir -p tools/markdown-formal
cp -R cli/* tools/markdown-formal/
\`\`\`

然后添加项目脚本：

\`\`\`json
{
  "scripts": {
    "formal": "node tools/markdown-formal/out/cli/formal-tools.js"
  }
}
\`\`\`

在拥有 \`.markdown-formal/config.json\` 的项目根目录运行 \`npm run formal -- prepare\`。

### AI 集成

审阅 \`skills/editor.md\` 和 \`skills/integrator.md\`，再把规则融合到目标项目原生 AI 指令中。不要从不可信远端自动安装或自动更新 skill。
`;
}

async function main(): Promise<void> {
    const pkg = await readJson(path.join(ROOT, 'package.json'));
    const releaseName = `${pkg.name}-${pkg.version}`;
    const releaseRoot = path.join(DIST_DIR, releaseName);
    const extensionRoot = path.join(releaseRoot, 'extension');
    const cliRoot = path.join(releaseRoot, 'cli');

    await requiredPath(path.join(ROOT, 'out', 'extension.js'));
    await requiredPath(path.join(ROOT, 'out', 'markdown-it-formal.js'));
    await requiredPath(path.join(ROOT, 'out', 'core', 'debug-log.js'));
    await requiredPath(path.join(ROOT, 'out', 'core', 'formal-core.js'));
    await requiredPath(path.join(ROOT, 'out', 'cli', 'formal-tools.js'));
    await requiredPath(path.join(ROOT, 'out', 'cli', 'release.js'));
    await requiredPath(path.join(ROOT, 'media', 'formal-script.js'));
    await requiredPath(path.join(ROOT, 'media', 'styles.css'));
    await requiredPath(path.join(ROOT, 'skills', 'editor.md'));
    await requiredPath(path.join(ROOT, 'skills', 'integrator.md'));
    await requiredPath(path.join(ROOT, 'README.md'));
    await requiredPath(path.join(ROOT, 'LICENSE'));

    await cleanDir(releaseRoot);

    const vsixName = await packageVsix(releaseRoot, pkg);

    await copyFile(path.join(ROOT, 'README.md'), path.join(releaseRoot, 'README.md'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(releaseRoot, 'LICENSE'));
    await copyDir(path.join(ROOT, 'skills'), path.join(releaseRoot, 'skills'));
    await copyDirIfExists(path.join(ROOT, 'docs'), path.join(releaseRoot, 'docs'));
    await writeText(path.join(releaseRoot, 'INSTALL.md'), releaseInstallDoc(pkg, vsixName));

    await writeJson(path.join(extensionRoot, 'package.json'), makeExtensionPackageJson(pkg));
    await copySelectedOutFiles(path.join(extensionRoot, 'out'));
    await copyDir(path.join(ROOT, 'media'), path.join(extensionRoot, 'media'));
    await copyDir(path.join(ROOT, 'skills'), path.join(extensionRoot, 'skills'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(extensionRoot, 'LICENSE'));

    await writeJson(path.join(cliRoot, 'package.json'), makeCliPackageJson(pkg));
    await copyFile(path.join(ROOT, 'out', 'cli', 'formal-tools.js'), path.join(cliRoot, 'out', 'cli', 'formal-tools.js'));
    await copyFile(path.join(ROOT, 'out', 'cli', 'release.js'), path.join(cliRoot, 'out', 'cli', 'release.js'));
    await copyDir(path.join(ROOT, 'skills'), path.join(cliRoot, 'skills'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(cliRoot, 'LICENSE'));

    await writeJson(path.join(releaseRoot, 'manifest.json'), {
        name: pkg.name,
        version: pkg.version,
        generatedAt: new Date().toISOString(),
        artifacts: {
            vsix: {
                path: vsixName,
                install: `code --install-extension ${vsixName}`
            },
            extension: {
                path: 'extension',
                entry: 'out/extension.js',
                install: 'Copy this directory to the editor extensions directory for local development.'
            },
            cli: {
                path: 'cli',
                entry: 'out/cli/formal-tools.js',
                install: 'Copy this directory into tools/markdown-formal and run node tools/markdown-formal/out/cli/formal-tools.js.'
            },
            skills: {
                path: 'skills',
                extensionPath: 'extension/skills',
                cliPath: 'cli/skills',
                mode: 'AI integration source; merge into the target project instructions instead of auto-installing from remote sources'
            },
            docs: {
                path: 'docs'
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
