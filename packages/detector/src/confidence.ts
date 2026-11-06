import type { Framework } from './types.js';

/** Base confidence per framework, before any adjustment. */
export const BASE_CONFIDENCE: Record<Framework, number> = {
  docker: 0.99,
  'eflex-config': 1,
  nextjs: 0.92,
  nuxt: 0.9,
  astro: 0.9,
  svelte: 0.9,
  vite: 0.92,
  laravel: 0.92,
  node: 0.85,
  python: 0.85,
  php: 0.72,
  static: 0.8,
};

/** Fallback confidence when a Python project has no recognised framework. */
export const UNKNOWN_PYTHON_CONFIDENCE = 0.55;

export interface ConfidenceSignals {
  /** A lockfile matches the detected package manager. */
  lockfile?: boolean;
  /** The runtime version is explicitly pinned in the repository. */
  pinnedRuntime?: boolean;
  /** The build script expected by the framework is missing. */
  missingBuildScript?: boolean;
  /** The entrypoint expected by the framework is missing. */
  missingEntrypoint?: boolean;
  /** The app was guessed while resolving a monorepo. */
  guessedMonorepoApp?: boolean;
}

/** Round to two decimals, the only precision exposed in DetectionResult. */
export function roundTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Clamp a confidence into [0, maximum] and round it. */
export function clampConfidence(value: number, maximum = 0.99): number {
  if (!Number.isFinite(value)) return 0;
  return roundTwo(Math.min(maximum, Math.max(0, value)));
}

export function scoreConfidence(base: number, signals: ConfidenceSignals = {}): number {
  let score = base;
  if (signals.lockfile) score += 0.03;
  if (signals.pinnedRuntime) score += 0.02;
  if (signals.missingBuildScript) score -= 0.15;
  if (signals.missingEntrypoint) score -= 0.15;
  if (signals.guessedMonorepoApp) score -= 0.25;
  return clampConfidence(score);
}

/** Multiplicative penalty used when a monorepo app is selected automatically. */
export function scaleConfidence(value: number, factor: number): number {
  return clampConfidence(value * factor);
}
