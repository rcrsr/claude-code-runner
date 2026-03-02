/**
 * Persistent run state for crash recovery
 * Serializes accumulated stats to a tmp file after each message,
 * allowing a subsequent run to detect and resume from a crashed session.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { TokenCounts } from '../output/stats.js';

/**
 * JSON-serializable form of RunStats.
 * Uses string[] instead of Set<string> for toolsUsed (Set doesn't JSON-serialize).
 */
export interface PersistedRunStats {
  messageCount: number;
  tokens: TokenCounts;
  toolsUsed: string[];
  toolUseCount: number;
  outputChars: number;
}

/**
 * Top-level persisted state written to the tmp file.
 */
export interface PersistedRunState {
  /** Schema version */
  version: 1;
  /** PID of the writing process */
  pid: number;
  /** ISO timestamp of run start */
  startedAt: string;
  /** Current step number */
  currentStep: number;
  /** Accumulated active runtime in ms (excludes crash gaps) */
  elapsedMs: number;
  /** Accumulated run stats */
  runStats: PersistedRunStats;
}

/**
 * Generate a stable 16-char hex ID from working directory and args.
 * Uses SHA-256 of `cwd + ':' + args.join(' ')`.
 */
export function generateStableId(cwd: string, args: string[]): string {
  return createHash('sha256')
    .update(cwd + ':' + args.join(' '))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Returns the tmp file path for a given stable ID.
 */
export function getStateFilePath(stableId: string): string {
  return join(tmpdir(), 'ccr-state-' + stableId + '.json');
}

/**
 * Type guard for PersistedRunState.
 * Parses the raw JSON value (unknown) and confirms it has version === 1.
 */
function isPersistedRunState(value: unknown): value is PersistedRunState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['version'] === 1 &&
    typeof v['pid'] === 'number' &&
    typeof v['elapsedMs'] === 'number'
  );
}

/**
 * Load persisted run state for a given stable ID.
 * Returns null if:
 *   - File does not exist
 *   - Schema version is not 1
 *   - The writing process is still alive (concurrent run)
 *   - Any parse or I/O error occurs
 * Returns the state if the writing process is dead (crash recovery scenario).
 */
export function loadRunState(stableId: string): PersistedRunState | null {
  try {
    const filePath = getStateFilePath(stableId);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!isPersistedRunState(parsed)) {
      return null;
    }

    try {
      process.kill(parsed.pid, 0);
      // Signal 0 succeeded — process is still alive — concurrent run, do not corrupt it
      return null;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ESRCH') {
        // Process is dead — this is a recovery scenario
        return parsed;
      }
      // Any other error (e.g. EPERM) — treat as unknown; do not assume dead
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Persist run state synchronously to the tmp file.
 * Errors are silently ignored to avoid crashing the runner on save failure.
 */
export function saveRunState(stableId: string, state: PersistedRunState): void {
  try {
    fs.writeFileSync(getStateFilePath(stableId), JSON.stringify(state));
  } catch {
    // Intentionally ignore — persistence is best-effort
  }
}

/**
 * Remove the persisted state file for a given stable ID.
 * Errors (including ENOENT) are silently ignored.
 */
export function clearRunState(stableId: string): void {
  try {
    fs.unlinkSync(getStateFilePath(stableId));
  } catch {
    // Intentionally ignore — file may already be absent
  }
}
