import type {
  BuildPlan,
  Candidate,
  ComposerJson,
  DetectionContext,
  DetectionResult,
  PackageJson,
  PackageManager,
  Question,
  RepoSnapshot,
} from './types.js';
import { clampConfidence, scaleConfidence } from './confidence.js';
import { discoverApps, isMonorepo, repoRootFromApp } from './monorepo.js';
import { detectDocker } from './detectors/dockerfile.js';
import { detectEflexConfig } from './detectors/eflex-config.js';
import { detectLaravel } from './detectors/laravel.js';
import { detectPhp } from './detectors/php.js';
import { detectNext } from './detectors/next.js';
import { detectNuxt } from './detectors/nuxt.js';
import { detectAstro } from './detectors/astro.js';
import { detectSvelte } from './detectors/svelte.js';
import { detectVite } from './detectors/vite.js';
import { detectRemix } from './detectors/remix.js';
import { detectSolidStart } from './detectors/solidstart.js';
import { detectRedwoodjs } from './detectors/redwoodjs.js';
import { detectNest, detectNodeFallback, detectServerFramework } from './detectors/node.js';
import { detectPython } from './detectors/python.js';
import { detectStaticBuild, detectStaticIndex } from './detectors/static.js';

/** Path segments that never participate in detection. */
export const IGNORED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'vendor',
  '.next',
  'dist',
  'build',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.turbo',
  '.cache',
]);

const STACK_OPTIONS = ['Next.js', 'Vite', 'Node', 'Laravel', 'PHP', 'Python', 'Site statique'];

interface RepoView {
  files: string[];
  read: (path: string) => string | null;
}

/** Normalize a path: forward slashes, no leading "./" or "/". */
export function normalizePath(input: string): string {
  let path = input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  while (path.startsWith('./')) path = path.slice(2);
  path = path.replace(/^\/+/, '');
  return path;
}

/** True when any path segment is on the ignore list. */
export function isIgnoredPath(input: string): boolean {
  const path = normalizePath(input);
  if (path === '') return false;
  return path.split('/').some((segment) => IGNORED_SEGMENTS.has(segment));
}

/** Normalize, filter ignored paths, deduplicate and sort. */
export function normalizeFiles(files: readonly string[]): string[] {
  const result = new Set<string>();
  for (const file of files) {
    const normalized = normalizePath(file);
    if (normalized === '' || isIgnoredPath(normalized)) continue;
    result.add(normalized);
  }
  return [...result].sort((a, b) => a.localeCompare(b));
}

function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createView(snapshot: RepoSnapshot): RepoView {
  const files = normalizeFiles(snapshot.files);
  const originalByNormalized = new Map<string, string>();

  for (const file of snapshot.files) {
    const normalized = normalizePath(file);
    if (!originalByNormalized.has(normalized)) originalByNormalized.set(normalized, file);
  }

  const cache = new Map<string, string | null>();

  return {
    files,
    read: (path: string): string | null => {
      const normalized = normalizePath(path);
      const cached = cache.get(normalized);
      if (cached !== undefined) return cached;
      const original = originalByNormalized.get(normalized);
      const value = snapshot.read(original ?? normalized);
      cache.set(normalized, value);
      return value;
    },
  };
}

function createContext(view: RepoView, root: string): DetectionContext {
  const fileSet = new Set(view.files);
  const prefix = root === '' ? '' : `${root}/`;
  const full = (path: string): string => `${prefix}${normalizePath(path)}`;

  const has = (path: string): boolean => fileSet.has(full(path));
  const hasRepo = (path: string): boolean => fileSet.has(normalizePath(path));
  const read = (path: string): string | null => view.read(full(path));
  const readRepo = (path: string): string | null => view.read(normalizePath(path));
  const list = (): string[] =>
    view.files
      .filter((file) => file.startsWith(prefix) && file !== prefix)
      .map((file) => file.slice(prefix.length));

  const packageJson = (): PackageJson | null => {
    const value = parseJsonObject(read('package.json'));
    return value === null ? null : (value as PackageJson);
  };

  const composerJson = (): ComposerJson | null => {
    const value = parseJsonObject(read('composer.json'));
    return value === null ? null : (value as ComposerJson);
  };

  const deps = (): Record<string, string> => {
    const pkg = packageJson();
    return {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {}),
    };
  };

  const scripts = (): Record<string, string> => packageJson()?.scripts ?? {};

  const hasAny = (name: string): boolean => has(name) || hasRepo(name);

  const hasJsLockfile = (): boolean =>
    ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json'].some(hasAny);

  const hasLockfile = (): boolean =>
    hasJsLockfile() ||
    ['composer.lock', 'poetry.lock', 'Pipfile.lock', 'uv.lock'].some(hasAny);

  const packageManager = (): PackageManager => {
    if (hasAny('pnpm-lock.yaml')) return 'pnpm';
    if (hasAny('yarn.lock')) return 'yarn';
    if (hasAny('bun.lockb') || hasAny('bun.lock')) return 'bun';
    if (hasAny('package-lock.json')) return 'npm';
    return 'npm';
  };

  return {
    root,
    repoRoot: '',
    files: view.files,
    has,
    hasRepo,
    read,
    readRepo,
    list,
    packageJson,
    composerJson,
    deps,
    scripts,
    packageManager,
    hasJsLockfile,
    hasLockfile,
  };
}

function stackQuestion(): Question {
  return {
    id: 'stack',
    prompt: 'Quelle est la stack de ce projet ?',
    kind: 'select',
    options: STACK_OPTIONS,
  };
}

function defaultQuestions(candidate: Candidate): Question[] {
  const start = candidate.plan.start ?? 'node index.js';

  switch (candidate.framework) {
    case 'node':
      return [
        {
          id: 'start',
          prompt: 'Quelle commande faut-il utiliser pour démarrer l\'application ?',
          kind: 'text',
          default: start,
        },
      ];
    case 'php':
      return [
        {
          id: 'start',
          prompt: 'Quelle commande faut-il utiliser pour démarrer le serveur PHP ?',
          kind: 'text',
          default: start,
        },
      ];
    case 'python':
      return [
        {
          id: 'start',
          prompt: 'Quelle commande faut-il utiliser pour démarrer l\'application Python ?',
          kind: 'text',
          default: start,
        },
      ];
    default:
      return [stackQuestion()];
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Keep at most two alternatives that differ from the primary plan. */
function selectAlternatives(primary: BuildPlan, plans: readonly BuildPlan[]): BuildPlan[] {
  const seen = new Set<string>([JSON.stringify(primary)]);
  const result: BuildPlan[] = [];

  for (const plan of plans) {
    const key = JSON.stringify(plan);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(plan);
    if (result.length === 2) break;
  }

  return result;
}

function collectCandidates(ctx: DetectionContext): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (candidate: Candidate | null): void => {
    if (candidate) candidates.push(candidate);
  };

  add(detectNext(ctx));
  add(detectNuxt(ctx));
  add(detectAstro(ctx));
  add(detectSvelte(ctx));
  add(detectVite(ctx));
  add(detectRemix(ctx));
  add(detectSolidStart(ctx));
  add(detectRedwoodjs(ctx));
  add(detectNest(ctx));
  add(detectServerFramework(ctx));
  add(detectStaticBuild(ctx));
  add(detectLaravel(ctx));
  add(detectPhp(ctx));
  add(detectPython(ctx));
  add(detectNodeFallback(ctx));
  add(detectStaticIndex(ctx));

  return candidates;
}

function finalizeCandidate(candidate: Candidate, alternativePlans: readonly BuildPlan[]): DetectionResult {
  const confidence = clampConfidence(candidate.confidence);
  let questions: Question[];
  if (candidate.questions && candidate.questions.length > 0) {
    // Required build args are actionable even when detection is highly confident.
    questions = candidate.questions;
  } else if (confidence < 0.7) {
    questions = defaultQuestions(candidate);
  } else {
    questions = [];
  }

  return {
    plan: candidate.plan,
    confidence,
    framework: candidate.framework,
    reasons: unique(candidate.reasons),
    warnings: unique(candidate.warnings),
    questions,
    alternatives: selectAlternatives(candidate.plan, alternativePlans),
  };
}

function unknownResult(): DetectionResult {
  return {
    plan: null,
    confidence: 0,
    framework: null,
    reasons: ['Aucun manifeste ou framework reconnu à la racine du dépôt.'],
    warnings: [],
    questions: [stackQuestion()],
    alternatives: [],
  };
}

function detectAt(view: RepoView, root: string, allowMonorepo: boolean): DetectionResult {
  const ctx = createContext(view, root);

  // Step 0: explicit configuration always wins.
  const eflex = detectEflexConfig(ctx);
  if (eflex) {
    const manifestPlans = collectCandidates(ctx).map((candidate) => candidate.plan);

    if (!eflex.candidate) {
      return {
        plan: null,
        confidence: 0,
        framework: null,
        reasons: [],
        warnings: [eflex.error ?? 'Configuration `eflex.json` invalide.'],
        questions: [stackQuestion()],
        alternatives: [],
      };
    }

    return {
      plan: eflex.candidate.plan,
      confidence: 1,
      framework: 'eflex-config',
      reasons: unique(eflex.candidate.reasons),
      warnings: unique(eflex.candidate.warnings),
      questions: [],
      alternatives: selectAlternatives(eflex.candidate.plan, manifestPlans),
    };
  }

  // Step 1: an explicit Dockerfile is an opaque build.
  const docker = detectDocker(ctx);
  if (docker) {
    return finalizeCandidate(docker, collectCandidates(ctx).map((candidate) => candidate.plan));
  }

  // Step 2: workspace markers and candidate applications.
  if (allowMonorepo && isMonorepo(ctx)) {
    const apps = discoverApps(view.files, root);

    if (apps.length === 1) {
      const app = apps[0];
      if (app) {
        const subResult = detectAt(view, app, false);
        if (!subResult.plan) return subResult;

        const repoRoot = repoRootFromApp(app);
        const confidence = scaleConfidence(subResult.confidence, 0.95);
        const plan: BuildPlan = { ...subResult.plan, root: app, repoRoot };

        return {
          plan,
          confidence,
          framework: subResult.framework,
          reasons: unique([`Application détectée dans \`${app}\`.`, ...subResult.reasons]),
          warnings: subResult.warnings,
          questions: confidence < 0.7 ? subResult.questions : [],
          alternatives: subResult.alternatives.map((alternative) => ({
            ...alternative,
            root: app,
            repoRoot,
          })),
        };
      }
    }

    if (apps.length > 1) {
      const alternatives: BuildPlan[] = [];
      for (const app of apps) {
        const result = detectAt(view, app, false);
        if (!result.plan) continue;
        alternatives.push({ ...result.plan, root: app, repoRoot: repoRootFromApp(app) });
        if (alternatives.length === 2) break;
      }

      return {
        plan: null,
        confidence: 0.45,
        framework: null,
        reasons: [
          `Monorepo détecté : ${apps.length} applications candidates (${apps.map((app) => `\`${app}\``).join(', ')}).`,
        ],
        warnings: [],
        questions: [
          {
            id: 'app',
            prompt: 'Quelle application de ce monorepo faut-il déployer ?',
            kind: 'select',
            options: apps,
          },
        ],
        alternatives,
      };
    }
  }

  // Step 3: manifest-based detection, first match wins.
  const candidates = collectCandidates(ctx);
  const primary = candidates[0];
  if (!primary) return unknownResult();

  return finalizeCandidate(primary, candidates.slice(1).map((candidate) => candidate.plan));
}

/** Deterministically turn a repository snapshot into a deployment build plan. */
export function detect(snapshot: RepoSnapshot): DetectionResult {
  const view = createView(snapshot);
  return detectAt(view, '', true);
}
