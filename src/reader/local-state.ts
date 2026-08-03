import * as path from 'node:path';

const os = require('node:os');

/**
 * Per-user state that helps a local Math Workspace session.  Nothing in this
 * directory is project source or a durable Codex conversation.
 */
export function mathWorkspaceStatePath(fileName: string): string {
    const overriddenProjectsFile = process.env.MATH_WORKSPACE_STATE;
    if (overriddenProjectsFile) return path.join(path.dirname(overriddenProjectsFile), fileName);

    const home = os.homedir();
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'math-workspace', fileName);
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || home, 'math-workspace', fileName);
    }
    return path.join(process.env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'math-workspace', fileName);
}

export function defaultProjectStateFilePath(): string {
    return mathWorkspaceStatePath('workspace-projects.json');
}
