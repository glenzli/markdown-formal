#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const targetsAll = ['npm', 'github', 'gitlab'];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function usage() {
    return [
        'Usage:',
        '  npm run release -- [options]',
        '',
        'Targets:',
        '  npm       Publish the npm package.',
        '  github    Push branch/tag to GitHub and create a GitHub release with dist assets.',
        '  gitlab    Push branch/tag to GitLab and create a GitLab release with dist assets.',
        '',
        'Options:',
        '  --only <targets>          Comma-separated target list, e.g. github,npm.',
        '  --skip <targets>          Comma-separated target list to exclude.',
        '  --dry-run                 Print mutating commands without executing them.',
        '  --no-check                Skip npm run release:check.',
        '  --tag <tag>               Release tag. Defaults to v<package.version>.',
        '  --npm-tag <tag>           npm dist-tag. Defaults to latest.',
        '  --otp <code>              npm one-time password.',
        '  --github-remote <name>    GitHub git remote. Defaults to github.',
        '  --gitlab-remote <name>    GitLab git remote. Defaults to gitlab.',
        '  --github-repo <repo>      gh repo selector. Defaults to glenzli/math-workspace.',
        '  --gitlab-repo <repo>      glab repo selector. Defaults to glenzli/math-workspace.',
        '  --draft                   Create a draft GitHub release.',
        '  --prerelease              Mark the GitHub release as prerelease.',
        '',
        'Examples:',
        '  npm run release -- --dry-run',
        '  npm run release -- --only github,npm',
        '  npm run release -- --skip gitlab',
        '  npm run release:npm -- --npm-tag latest',
    ].join('\n');
}

function parseList(value) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeTarget(target) {
    if (target === 'npmjs') return 'npm';
    if (target === 'all') return 'all';
    return target;
}

function parseArgs(argv) {
    const options = {
        dryRun: false,
        check: true,
        only: [],
        skip: [],
        tag: undefined,
        npmTag: 'latest',
        otp: undefined,
        githubRemote: 'github',
        gitlabRemote: 'gitlab',
        githubRepo: 'glenzli/math-workspace',
        gitlabRepo: 'glenzli/math-workspace',
        draft: false,
        prerelease: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const nextValue = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`Missing value for ${arg}`);
            }
            i += 1;
            return value;
        };

        if (arg === '--help' || arg === '-h') {
            console.log(usage());
            process.exit(0);
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--no-check') {
            options.check = false;
        } else if (arg === '--only' || arg === '--target' || arg === '--targets') {
            options.only.push(...parseList(nextValue()));
        } else if (arg.startsWith('--only=')) {
            options.only.push(...parseList(arg.slice('--only='.length)));
        } else if (arg.startsWith('--target=')) {
            options.only.push(...parseList(arg.slice('--target='.length)));
        } else if (arg.startsWith('--targets=')) {
            options.only.push(...parseList(arg.slice('--targets='.length)));
        } else if (arg === '--skip' || arg === '--exclude') {
            options.skip.push(...parseList(nextValue()));
        } else if (arg.startsWith('--skip=')) {
            options.skip.push(...parseList(arg.slice('--skip='.length)));
        } else if (arg.startsWith('--exclude=')) {
            options.skip.push(...parseList(arg.slice('--exclude='.length)));
        } else if (arg === '--tag') {
            options.tag = nextValue();
        } else if (arg.startsWith('--tag=')) {
            options.tag = arg.slice('--tag='.length);
        } else if (arg === '--npm-tag') {
            options.npmTag = nextValue();
        } else if (arg.startsWith('--npm-tag=')) {
            options.npmTag = arg.slice('--npm-tag='.length);
        } else if (arg === '--otp') {
            options.otp = nextValue();
        } else if (arg.startsWith('--otp=')) {
            options.otp = arg.slice('--otp='.length);
        } else if (arg === '--github-remote') {
            options.githubRemote = nextValue();
        } else if (arg.startsWith('--github-remote=')) {
            options.githubRemote = arg.slice('--github-remote='.length);
        } else if (arg === '--gitlab-remote') {
            options.gitlabRemote = nextValue();
        } else if (arg.startsWith('--gitlab-remote=')) {
            options.gitlabRemote = arg.slice('--gitlab-remote='.length);
        } else if (arg === '--github-repo') {
            options.githubRepo = nextValue();
        } else if (arg.startsWith('--github-repo=')) {
            options.githubRepo = arg.slice('--github-repo='.length);
        } else if (arg === '--gitlab-repo') {
            options.gitlabRepo = nextValue();
        } else if (arg.startsWith('--gitlab-repo=')) {
            options.gitlabRepo = arg.slice('--gitlab-repo='.length);
        } else if (arg === '--draft') {
            options.draft = true;
        } else if (arg === '--prerelease') {
            options.prerelease = true;
        } else {
            throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
        }
    }

    const only = options.only.map(normalizeTarget);
    const skip = new Set(options.skip.map(normalizeTarget));
    let targets = only.length > 0 && !only.includes('all') ? only : targetsAll;
    targets = [...new Set(targets)].filter((target) => !skip.has(target));

    for (const target of targets) {
        if (!targetsAll.includes(target)) {
            throw new Error(`Unknown release target: ${target}. Expected one of: ${targetsAll.join(', ')}`);
        }
    }
    if (targets.length === 0) {
        throw new Error('No release targets selected.');
    }

    return { ...options, targets };
}

function commandLine(command, args) {
    return [command, ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ');
}

function run(command, args, options = {}) {
    const line = commandLine(command, args);
    if (options.dryRun && options.mutates) {
        console.log(`[dry-run] ${line}`);
        return '';
    }

    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    if (result.status !== 0) {
        if (options.allowFailure) {
            return {
                ok: false,
                stdout: result.stdout || '',
                stderr: result.stderr || '',
            };
        }
        const detail = options.capture ? `\n${result.stderr || result.stdout || ''}` : '';
        throw new Error(`Command failed: ${line}${detail}`);
    }

    if (options.allowFailure) {
        return {
            ok: true,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
        };
    }
    return options.capture ? result.stdout.trim() : '';
}

function cleanStatus() {
    return run('git', ['status', '--short'], { capture: true });
}

function ensureCleanWorktree(options) {
    const status = cleanStatus();
    if (!status) return;
    if (options.dryRun) {
        console.warn(`[dry-run] Working tree is dirty; real release would stop:\n${status}`);
        return;
    }
    throw new Error(`Working tree is not clean. Commit or stash changes before release.\n${status}`);
}

function tagExists(tag) {
    const result = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], {
        cwd: process.cwd(),
        stdio: 'ignore',
    });
    return result.status === 0;
}

function tagCommit(tag) {
    return run('git', ['rev-list', '-n', '1', tag], { capture: true });
}

function ensureTag(tag, commit, options) {
    if (!tagExists(tag)) {
        run('git', ['tag', '-a', tag, commit, '-m', `Release ${tag}`], { mutates: true, dryRun: options.dryRun });
        return;
    }

    const existingCommit = tagCommit(tag);
    if (existingCommit !== commit) {
        throw new Error(`Tag ${tag} points to ${existingCommit}, expected ${commit}.`);
    }
}

function releaseCommitRange() {
    const previous = run('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD^'], {
        capture: true,
        allowFailure: true,
    });
    if (previous.ok && previous.stdout.trim()) {
        return `${previous.stdout.trim()}..HEAD`;
    }
    return undefined;
}

function releaseAssets(pkg) {
    return [
        { path: 'dist/manifest.json', label: 'manifest.json' },
        { path: 'dist/checksums.txt', label: 'checksums.txt' },
        { path: 'dist/INSTALL.md', label: 'INSTALL.md' },
    ];
}

function ensureAssets(pkg, options) {
    if (options.dryRun) return;
    const missing = releaseAssets(pkg).filter((asset) => !fs.existsSync(asset.path));
    if (missing.length > 0) {
        throw new Error(`Missing release assets. Run npm run release:local first.\n${missing.map((asset) => `- ${asset.path}`).join('\n')}`);
    }
}

function labeledAssetArgs(pkg) {
    return releaseAssets(pkg).map((asset) => `${asset.path}#${asset.label}`);
}

function releaseNotesFile(tag, pkg) {
    const range = releaseCommitRange();
    const commits = range
        ? run('git', ['log', '--oneline', '--no-merges', range], { capture: true }).split(/\r?\n/).filter(Boolean)
        : [];
    const changeLines = commits.length > 0
        ? commits.map((line) => `- ${line}`)
        : ['- See repository history for details.'];

    const content = [
        `# ${tag}`,
        '',
        '## Package',
        `- \`${pkg.name}@${pkg.version}\``,
        '',
        '## Artifacts',
        '- `manifest.json`: release artifact map.',
        '- `checksums.txt`: SHA-256 checksums.',
        '- `INSTALL.md`: installation and vendoring notes.',
        '',
        '## Install',
        '',
        '```bash',
        `npm install -D ${pkg.name}`,
        '```',
        '',
        '## Changes',
        ...changeLines,
        '',
    ].join('\n');

    const file = path.join(os.tmpdir(), `${pkg.name}-${tag}-release-notes.md`);
    fs.writeFileSync(file, content);
    return file;
}

function npmPackagePublished(pkg, options) {
    if (options.dryRun) return false;
    const result = run('npm', ['--registry', 'https://registry.npmjs.org', 'view', `${pkg.name}@${pkg.version}`, 'version'], {
        capture: true,
        allowFailure: true,
    });
    return result.ok && result.stdout.trim() === pkg.version;
}

function publishNpm(pkg, options) {
    if (npmPackagePublished(pkg, options)) {
        console.log(`npm package already published: ${pkg.name}@${pkg.version}`);
        return;
    }

    const args = ['publish', '--registry', 'https://registry.npmjs.org'];
    if (options.npmTag) args.push('--tag', options.npmTag);
    if (options.otp) args.push('--otp', options.otp);
    run('npm', args, { mutates: true, dryRun: options.dryRun });
}

function pushRemote(remote, branch, tag, options) {
    run('git', ['remote', 'get-url', remote], { capture: true });
    run('git', ['push', remote, branch], { mutates: true, dryRun: options.dryRun });
    run('git', ['push', remote, tag], { mutates: true, dryRun: options.dryRun });
}

function releaseGithub(tag, pkg, branch, notesFile, options) {
    pushRemote(options.githubRemote, branch, tag, options);
    const assets = labeledAssetArgs(pkg);
    if (options.dryRun) {
        const args = ['release', 'create', tag, ...assets, '--repo', options.githubRepo, '--verify-tag', '--latest', '--title', tag, '--notes-file', '<generated>'];
        if (options.draft) args.push('--draft');
        if (options.prerelease) args.push('--prerelease');
        run('gh', args, { mutates: true, dryRun: true });
        return;
    }

    run('gh', ['auth', 'status']);
    const existing = run('gh', ['release', 'view', tag, '--repo', options.githubRepo, '--json', 'url'], {
        capture: true,
        allowFailure: true,
    });
    if (existing.ok) {
        const parsed = JSON.parse(existing.stdout);
        console.log(`GitHub release already exists: ${parsed.url}`);
        return;
    }

    const args = ['release', 'create', tag, ...assets, '--repo', options.githubRepo, '--verify-tag', '--latest', '--title', tag, '--notes-file', notesFile];
    if (options.draft) args.push('--draft');
    if (options.prerelease) args.push('--prerelease');
    run('gh', args, { mutates: true });
}

function releaseGitlab(tag, pkg, branch, notesFile, options) {
    pushRemote(options.gitlabRemote, branch, tag, options);
    const assets = labeledAssetArgs(pkg);
    if (options.dryRun) {
        run('glab', ['release', 'create', tag, ...assets, '--repo', options.gitlabRepo, '--name', tag, '--notes-file', '<generated>', '--no-update'], {
            mutates: true,
            dryRun: true,
        });
        return;
    }

    run('glab', ['auth', 'status']);
    const existing = run('glab', ['release', 'view', tag, '--repo', options.gitlabRepo, '--output', 'json'], {
        capture: true,
        allowFailure: true,
    });
    if (existing.ok) {
        console.log(`GitLab release already exists: ${tag}`);
        return;
    }

    run('glab', ['release', 'create', tag, ...assets, '--repo', options.gitlabRepo, '--name', tag, '--notes-file', notesFile, '--no-update'], {
        mutates: true,
    });
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const pkg = readJson('package.json');
    const tag = options.tag || `v${pkg.version}`;
    const branch = run('git', ['branch', '--show-current'], { capture: true });
    if (!branch) throw new Error('Cannot release from a detached HEAD.');

    console.log(`Release ${tag}: ${options.targets.join(', ')}`);
    ensureCleanWorktree(options);

    if (options.check) {
        run('npm', ['run', 'release:check'], { mutates: true, dryRun: options.dryRun });
        ensureCleanWorktree(options);
    }

    ensureAssets(pkg, options);
    const commit = run('git', ['rev-parse', 'HEAD'], { capture: true });
    ensureTag(tag, commit, options);
    const notesFile = options.dryRun ? '<generated>' : releaseNotesFile(tag, pkg);

    if (options.targets.includes('npm')) publishNpm(pkg, options);
    if (options.targets.includes('github')) releaseGithub(tag, pkg, branch, notesFile, options);
    if (options.targets.includes('gitlab')) releaseGitlab(tag, pkg, branch, notesFile, options);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
