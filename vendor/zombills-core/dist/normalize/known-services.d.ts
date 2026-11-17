import type { KnownService } from "./types.js";
export declare const KNOWN_SERVICES: readonly KnownService[];
/** Returns the Known service with this id, or `undefined`. */
export declare function getKnownService(serviceId: string): KnownService | undefined;
