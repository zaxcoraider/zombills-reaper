import type { Transaction } from "../parse/types.js";
import type { NormalizedTransaction } from "./types.js";
export declare function normalizeTransactions(transactions: readonly Transaction[]): NormalizedTransaction[];
