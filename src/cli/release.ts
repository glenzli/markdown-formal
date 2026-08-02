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

async function copyPublicDocs(destDocs: string): Promise<void> {
    const publicDocs = ['usage.md', 'release.md'];
    for (const fileName of publicDocs) {
        await copyFile(path.join(ROOT, 'docs', fileName), path.join(destDocs, fileName));
    }
}

async function writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

async function writeJson(filePath: string, value: any): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeCliPackageJson(pkg: any): any {
    return {
        name: `${pkg.name}-cli`,
        version: pkg.version,
        private: true,
        license: pkg.license,
        repository: pkg.repository,
        description: 'CLI and local Reader artifacts for markdown-formal',
        bin: {
            'markdown-formal': 'out/cli/formal-tools.js'
        },
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

function releaseInstallDoc(pkg: any): string {
    return `# ${pkg.name} ${pkg.version}

Language: [English](#english) | [中文](#中文)

<a id="english"></a>

## English

This release bundle contains the local Reader, CLI runtime, Codex MCP plugin, documentation, AI workflow artifacts, and a VASMC catalog for lockable reuse.

### Artifacts

- \`cli/\`: dependency-free CLI runtime and bundled local Reader for target projects.
- \`.agents/plugins/\` and \`plugins/\`: Codex marketplace and the Reader MCP plugin.
- \`skills/\`: reviewed AI workflow artifacts.
- \`vasm-catalog/\`: VASMC catalog exports for lockable reuse.
- \`docs/\`: usage and release documentation.
- \`manifest.json\`: machine-readable artifact map.
- \`checksums.txt\`: SHA-256 checksums.

### Run the Reader

\`\`\`bash
node cli/out/cli/formal-tools.js serve /path/to/project
\`\`\`

Open the printed localhost URL in your preferred browser or local side panel. The Reader is read-only and binds only to \`127.0.0.1\`.

### Use the Codex MCP Plugin

Install the bundled CLI so \`markdown-formal\` is on \`PATH\`, then add the release bundle as a marketplace:

\`\`\`bash
npm install -g ./cli
codex plugin marketplace add /path/to/markdown-formal-release
codex plugin add markdown-formal-reader@personal
\`\`\`

The plugin returns a local URL for the browser-based Reader; it does not embed or replace the Reader UI.

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

### AI Artifacts

Review \`skills/editor.md\` and \`skills/integrator.md\`, then merge the rules into the target project's native AI instructions. If the target project uses VASMC, prefer \`vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export editor\` and \`--export integrator\` so the consumer lockfile fixes artifact hashes. Do not auto-install or auto-update skills from an untrusted remote source.

<a id="中文"></a>

## 中文

这个 release 包包含本地 Reader、CLI 运行时、Codex MCP plugin、文档、面向 AI 的工作流 artifact，以及可锁定复用的 VASMC catalog。

### 产物

- \`cli/\`：目标项目使用的无运行时依赖 CLI 与内置本地 Reader。
- \`.agents/plugins/\` 与 \`plugins/\`：Codex marketplace 和 Reader MCP plugin。
- \`skills/\`：需要审阅和融合的 AI 工作流 artifact。
- \`vasm-catalog/\`：供 VASMC consumer 锁定复用的 catalog exports。
- \`docs/\`：使用和 release 文档。
- \`manifest.json\`：机器可读产物表。
- \`checksums.txt\`：SHA-256 校验和。

### 启动 Reader

\`\`\`bash
node cli/out/cli/formal-tools.js serve /path/to/project
\`\`\`

在浏览器或本地侧栏中打开命令输出的 localhost URL。Reader 只读，并且只绑定 \`127.0.0.1\`。

### 使用 Codex MCP Plugin

先安装 bundle 内的 CLI，使 \`markdown-formal\` 位于 \`PATH\`，再将 release 根目录作为 marketplace 添加：

\`\`\`bash
npm install -g ./cli
codex plugin marketplace add /path/to/markdown-formal-release
codex plugin add markdown-formal-reader@personal
\`\`\`

plugin 返回浏览器 Reader 的本地 URL，不嵌入或替代 Reader UI。

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

### AI Artifacts

审阅 \`skills/editor.md\` 和 \`skills/integrator.md\`，并把规则融合到目标项目原生 AI 指令中。如果目标项目使用 VASMC，优先用 \`vasmc add --catalog path/to/vasm-catalog/vasmc-catalog.yaml --export editor\` 和 \`--export integrator\` 接入，让 consumer lockfile 固定 artifact hash。不要从不可信远端自动安装或自动更新 skill。
`;
}

async function main(): Promise<void> {
    const pkg = await readJson(path.join(ROOT, 'package.json'));
    const releaseRoot = DIST_DIR;
    const cliRoot = path.join(releaseRoot, 'cli');
    const catalogRoot = path.join(ROOT, 'vasm-catalog');
    const marketplaceRoot = path.join(ROOT, '.agents', 'plugins');
    const pluginRoot = path.join(ROOT, 'plugins');

    await requiredPath(path.join(ROOT, 'out', 'cli', 'formal-tools.js'));
    await requiredPath(path.join(ROOT, 'out', 'cli', 'release.js'));
    await requiredPath(path.join(ROOT, 'out', 'reader', 'index.html'));
    await requiredPath(path.join(ROOT, 'skills', 'editor.md'));
    await requiredPath(path.join(ROOT, 'skills', 'integrator.md'));
    await requiredPath(path.join(catalogRoot, 'vasmc-catalog.yaml'));
    await requiredPath(path.join(ROOT, 'README.md'));
    await requiredPath(path.join(ROOT, 'LICENSE'));
    await requiredPath(path.join(ROOT, 'docs', 'usage.md'));
    await requiredPath(path.join(ROOT, 'docs', 'release.md'));
    await requiredPath(path.join(marketplaceRoot, 'marketplace.json'));
    await requiredPath(path.join(pluginRoot, 'markdown-formal-reader', '.codex-plugin', 'plugin.json'));

    await cleanDir(releaseRoot);

    await copyFile(path.join(ROOT, 'README.md'), path.join(releaseRoot, 'README.md'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(releaseRoot, 'LICENSE'));
    await copyDir(path.join(ROOT, 'media', 'readme'), path.join(releaseRoot, 'media', 'readme'));
    await copyDir(path.join(ROOT, 'skills'), path.join(releaseRoot, 'skills'));
    await copyDir(marketplaceRoot, path.join(releaseRoot, '.agents', 'plugins'));
    await copyDir(pluginRoot, path.join(releaseRoot, 'plugins'));
    await copyDir(catalogRoot, path.join(releaseRoot, 'vasm-catalog'));
    await copyPublicDocs(path.join(releaseRoot, 'docs'));
    await writeText(path.join(releaseRoot, 'INSTALL.md'), releaseInstallDoc(pkg));

    await writeJson(path.join(cliRoot, 'package.json'), makeCliPackageJson(pkg));
    await copyFile(path.join(ROOT, 'out', 'cli', 'formal-tools.js'), path.join(cliRoot, 'out', 'cli', 'formal-tools.js'));
    await copyFile(path.join(ROOT, 'out', 'cli', 'release.js'), path.join(cliRoot, 'out', 'cli', 'release.js'));
    await copyDir(path.join(ROOT, 'out', 'reader'), path.join(cliRoot, 'out', 'reader'));
    await copyDir(path.join(ROOT, 'skills'), path.join(cliRoot, 'skills'));
    await copyDir(catalogRoot, path.join(cliRoot, 'vasm-catalog'));
    await copyPublicDocs(path.join(cliRoot, 'docs'));
    await copyFile(path.join(ROOT, 'LICENSE'), path.join(cliRoot, 'LICENSE'));

    await writeJson(path.join(releaseRoot, 'manifest.json'), {
        name: pkg.name,
        version: pkg.version,
        generatedAt: new Date().toISOString(),
        artifacts: {
            reader: {
                path: 'cli/out/reader',
                serve: 'node cli/out/cli/formal-tools.js serve /path/to/project',
                mode: 'Primary local read-only interface, bound to 127.0.0.1'
            },
            cli: {
                path: 'cli',
                entry: 'out/cli/formal-tools.js',
                bin: 'markdown-formal',
                skillsPath: 'cli/skills',
                vasmCatalogPath: 'cli/vasm-catalog/vasmc-catalog.yaml',
                install: 'Copy this directory into tools/markdown-formal and run node tools/markdown-formal/out/cli/formal-tools.js.'
            },
            codexMcpPlugin: {
                marketplace: '.agents/plugins/marketplace.json',
                plugin: 'plugins/markdown-formal-reader',
                command: 'markdown-formal mcp',
                mode: 'Codex MCP launcher that returns a localhost URL for the independent browser-based Reader; install cli/ first so markdown-formal is on PATH.'
            },
            skills: {
                path: 'skills',
                cliPath: 'cli/skills',
                mode: 'Reviewed AI workflow artifacts; merge into the target project instructions instead of auto-installing from remote sources'
            },
            vasmCatalog: {
                path: 'vasm-catalog',
                index: 'vasm-catalog/vasmc-catalog.yaml',
                mode: 'VASMC catalog exports; consume with vasmc add --catalog and commit the consumer lockfile.'
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
