declare module 'vscode' {
    export const workspace: any;
    export const Uri: any;
    export const commands: any;
    export const window: any;
    export interface ExtensionContext {
        subscriptions: any[];
    }
}
