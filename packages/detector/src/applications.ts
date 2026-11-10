import type { BuildPlan, DetectionContext, Framework, RepoSnapshot } from './types.js';
import { createContext, createView, detectAt, resolveApplication, type RepoView } from './detect.js';
import { discoverApps, isMonorepo } from './monorepo.js';

/**
 * Application déployable repérée dans un dépôt.
 *
 * Un dépôt mono-application renvoie un tableau d'un élément (`root: ""`), ce qui
 * laisse l'interface existante inchangée. `plan` reste un `BuildPlan` v1 : D2
 * n'ajoute aucun champ au contrat de plan.
 */
export interface DetectedApplication {
  /** Chemin relatif au dépôt, `""` pour la racine. */
  root: string;
  /**
   * Nom court et stable : `package.json#name` sans scope, sinon dernier segment
   * du dossier. Normalisé `[a-z0-9-]`, 24 caractères maximum, dédupliqué
   * (`web`, `web-2`).
   */
  name: string;
  framework: Framework | null;
  plan: BuildPlan;
  confidence: number;
  /** Français, même formulation que `detect()`. */
  reasons: string[];
  /** Français. */
  warnings: string[];
}

export interface DetectApplicationsOptions {
  /**
   * Profondeur maximale de découverte sous la racine du dépôt.
   * 3 par défaut (`apps/packages/foo`), pour couvrir les monorepos imbriqués.
   */
  maxDepth?: number;
  /**
   * Nom de repli pour l'application à la racine quand aucun `package.json#name`
   * n'est disponible (le portail y passe le nom du dépôt).
   */
  rootName?: string;
}

/** Profondeur par défaut de `detectApplications()` (`apps/<groupe>/<app>`). */
export const DEFAULT_APPLICATION_DEPTH = 3;
/** Longueur maximale d'un nom d'application. */
export const MAX_APPLICATION_NAME_LENGTH = 24;

/** Dépendances qui rendent un paquet Node déployable même sans script `start`. */
const NODE_SERVER_DEPENDENCIES = ['express', 'fastify', 'koa', 'hono', '@nestjs/core'];
/** Points d'entrée reconnus par le détecteur Node. */
const NODE_ENTRYPOINTS = ['index.js', 'server.js', 'src/index.js', 'src/server.js'];

/**
 * Normalise un nom d'application : sans scope npm (`@acme/web` → `web`),
 * minuscules, accents retirés, caractères non alphanumériques remplacés par
 * `-`, 24 caractères maximum.
 */
export function normalizeApplicationName(input: string): string {
  const unscoped = input.includes('/') ? input.slice(input.lastIndexOf('/') + 1) : input;
  const normalized = unscoped
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.slice(0, MAX_APPLICATION_NAME_LENGTH).replace(/-+$/g, '');
}

function readPackageName(view: RepoView, root: string): string | null {
  const raw = view.read(root === '' ? 'package.json' : `${root}/package.json`);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const name = (parsed as { name?: unknown }).name;
    if (typeof name !== 'string') return null;
    const normalized = normalizeApplicationName(name);
    return normalized === '' ? null : normalized;
  } catch {
    return null;
  }
}

function fallbackName(root: string, rootName: string | undefined): string {
  if (root === '') return normalizeApplicationName(rootName ?? '') || 'app';
  const segment = root.split('/').filter(Boolean).pop() ?? '';
  return normalizeApplicationName(segment) || 'app';
}

/** Nom proposé, avant déduplication. */
function proposedName(view: RepoView, root: string, rootName: string | undefined): string {
  return readPackageName(view, root) ?? fallbackName(root, rootName);
}

/** Ajoute `-2`, `-3`… de façon déterministe quand deux applications partagent un nom. */
function deduplicateName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const trimmed = base.slice(0, MAX_APPLICATION_NAME_LENGTH - tail.length).replace(/-+$/g, '');
    const candidate = `${trimmed === '' ? 'app' : trimmed}${tail}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/**
 * Un paquet Node n'est une application que s'il peut réellement démarrer un
 * processus : script `start`, dépendance serveur connue ou point d'entrée. Un
 * paquet de bibliothèque (`packages/ui` : build seul, aucune dépendance
 * serveur) est ainsi écarté au lieu de devenir un faux positif `node`.
 */
function isNodeApplication(ctx: DetectionContext): boolean {
  const start = ctx.scripts().start;
  if (typeof start === 'string' && start.trim() !== '') return true;

  const deps = ctx.deps();
  if (NODE_SERVER_DEPENDENCIES.some((name) => typeof deps[name] === 'string')) return true;

  return NODE_ENTRYPOINTS.some((file) => ctx.has(file));
}

function isDeployable(view: RepoView, root: string, framework: Framework | null): boolean {
  if (framework === null) return false;
  if (framework !== 'node') return true;
  return isNodeApplication(createContext(view, root));
}

/**
 * Énumère **toutes** les applications déployables d'un dépôt, sans I/O :
 * entrée uniquement le `RepoSnapshot`.
 *
 * Règles :
 * - `eflex.json`, compose ou Dockerfile à la racine : une seule application
 *   (même précédence que `detect()`), car le contrat racine décrit le dépôt ;
 * - sinon, dépôt mono-application : une entrée `root: ""` ;
 * - sinon monorepo (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`,
 *   `lerna.json` ou `workspaces`) : les dossiers découverts jusqu'à
 *   `maxDepth` (3 par défaut) ; la racine n'est retenue que si aucun dossier
 *   n'est découvrable ;
 * - les segments ignorés (`node_modules`, `.git`, `vendor`, `.next`, `dist`,
 *   `build`…) sont retirés par `createView()` avant l'énumération ;
 * - ordre déterministe : racine d'abord, puis `root` alphabétique ; noms
 *   dédupliqués dans cet ordre.
 *
 * Les dossiers qui ne produisent aucun plan déployable sont omis : un manifeste
 * de bibliothèque ou un `package.json` de configuration n'est pas une
 * application.
 */
export function detectApplications(
  snapshot: RepoSnapshot,
  options: DetectApplicationsOptions = {},
): DetectedApplication[] {
  const view = createView(snapshot);
  const rootCtx = createContext(view, '');
  const rootResult = detectAt(view, '', false);
  const monorepo = isMonorepo(rootCtx);
  const rootIsExplicit =
    rootResult.framework === 'eflex-config' ||
    rootResult.framework === 'compose' ||
    rootResult.framework === 'docker';

  let roots: string[];
  if (rootIsExplicit || !monorepo) {
    roots = [''];
  } else {
    // Un monorepo est décrit par ses dossiers applicatifs : la racine n'est
    // retenue que si elle porte elle-même un contrat explicite (traité
    // ci-dessus) ou si aucun dossier n'est découvrable.
    const discovered = discoverApps(view.files, '', {
      maxDepth: options.maxDepth ?? DEFAULT_APPLICATION_DEPTH,
    });
    roots = discovered.length > 0 ? discovered : [''];
  }

  roots.sort((a, b) => {
    if (a === b) return 0;
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  const applications: DetectedApplication[] = [];
  for (const root of roots) {
    const result = root === '' ? rootResult : resolveApplication(view, root);
    if (!result.plan || !isDeployable(view, root, result.framework)) continue;

    applications.push({
      root,
      name: '',
      framework: result.framework,
      plan: result.plan,
      confidence: result.confidence,
      reasons: result.reasons,
      warnings: result.warnings,
    });
  }

  const used = new Set<string>();
  for (const application of applications) {
    application.name = deduplicateName(
      proposedName(view, application.root, options.rootName),
      used,
    );
  }

  return applications;
}
