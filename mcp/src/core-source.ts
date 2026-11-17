// Both values are injected by esbuild `define` in scripts/build.ts.
declare const __CORE_SOURCE__: string;
declare const __APP_VERSION__: string;

/** Line 1 of vendor/zombills-core/SOURCE: the Zombills commit Core was built from. */
export const CORE_SOURCE: string = __CORE_SOURCE__;
/** The `version` of app.json. */
export const APP_VERSION: string = __APP_VERSION__;
