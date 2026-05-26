declare module 'fs' {
    export const existsSync: any;
    export const readFileSync: any;
    export const promises: any;
    export const mkdirSync: any;
}

declare module 'node:fs/promises' {
    export const access: any;
    export const copyFile: any;
    export const mkdir: any;
    export const readFile: any;
    export const readdir: any;
    export const rm: any;
    export const stat: any;
    export const writeFile: any;
}

declare module 'path' {
    export const join: any;
    export const basename: any;
}

declare module 'node:path' {
    export const basename: any;
    export const dirname: any;
    export const join: any;
    export const posix: any;
    export const relative: any;
    export const resolve: any;
    export const sep: any;
}

declare module 'node:crypto' {
    export const createHash: any;
    export const randomBytes: any;
}

declare const require: (module: string) => any;
declare const process: any;
