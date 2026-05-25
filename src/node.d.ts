declare module 'fs' {
    export const existsSync: any;
    export const readFileSync: any;
    export const promises: any;
    export const mkdirSync: any;
}

declare module 'path' {
    export const join: any;
    export const basename: any;
}

declare const require: (module: string) => any;
