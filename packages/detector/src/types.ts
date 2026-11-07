/** Immutable view of a repository. Paths use forward slashes, relative to repo root. */
export interface RepoSnapshot {
  files: string[];
  read: (path: string) => string | null;
}

export interface ServiceSpec {
  command: string;
  replicas?: number; // 1..10
  healthcheck?: string;
  port?: number;
}

export interface BuildPlan {
  version: 1;
  framework: Framework;
  runtime: string; // "node@22" | "php@8.3" | "python@3.12" | "static@1" | "docker@1"
  root: string; // "" for repo root, else "apps/web"
  repoRoot?: string; // set when root !== ""
  install?: string;
  build?: string;
  start?: string;
  port: number;
  healthcheck?: string;
  services?: Record<string, ServiceSpec>;
  volumes?: string[];
  postDeploy?: string[];
  buildEnv?: Record<string, string>;
  /** Public values frozen into the image at build time. Never runtime secrets. */
  buildArgs?: Record<string, string>;
  /** Optional resource hints consumed by the renderer (limits). */
  resources?: {
    cpu?: number;
    memoryMb?: number;
  };
}

export type Framework =
  | 'docker'
  | 'eflex-config'
  | 'nextjs'
  | 'nuxt'
  | 'astro'
  | 'vite'
  | 'svelte'
  | 'remix'
  | 'solidstart'
  | 'redwoodjs'
  | 'node'
  | 'laravel'
  | 'php'
  | 'python'
  | 'static';

export interface Question {
  id: string;
  prompt: string; // French
  kind: 'select' | 'text' | 'boolean';
  options?: string[];
  default?: string;
}

export interface DetectionResult {
  plan: BuildPlan | null;
  confidence: number; // 0..1, rounded to 2 decimals
  framework: Framework | null;
  reasons: string[]; // French, human-readable, ordered by importance
  warnings: string[]; // French
  questions: Question[]; // empty when confidence >= 0.7
  alternatives: BuildPlan[]; // 0..2 other plausible plans
}

/** Package manager inferred from lockfiles. Deterministic priority: pnpm, yarn, bun, npm. */
export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun';

/** Minimal, loosely typed view of package.json. */
export interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
  workspaces?: unknown;
  [key: string]: unknown;
}

/** Minimal, loosely typed view of composer.json. */
export interface ComposerJson {
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Read-only detection context for one application root.
 * All paths passed to `has`, `read` and `list` are relative to `root`.
 */
export interface DetectionContext {
  readonly root: string;
  readonly repoRoot: string;
  readonly files: readonly string[];
  has(path: string): boolean;
  hasRepo(path: string): boolean;
  read(path: string): string | null;
  readRepo(path: string): string | null;
  list(): string[];
  packageJson(): PackageJson | null;
  composerJson(): ComposerJson | null;
  deps(): Record<string, string>;
  scripts(): Record<string, string>;
  packageManager(): PackageManager;
  hasJsLockfile(): boolean;
  hasLockfile(): boolean;
}

/** Internal candidate produced by a detector before final ranking. */
export interface Candidate {
  framework: Framework;
  plan: BuildPlan;
  confidence: number;
  reasons: string[];
  warnings: string[];
  questions?: Question[];
}
