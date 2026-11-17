import type { Entry } from "./internal-types.js";
export type ValidationResult = {
    ok: true;
    entry: Omit<Entry, "rank">;
} | {
    ok: false;
    reason: string;
};
export declare function validateElement(value: unknown, index: number): ValidationResult;
