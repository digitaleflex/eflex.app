import type { DetectionContext } from './types.js';

const MONOREPO_MARKERS = ['pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json'];

/** Manifests that identify a deployable application directory. */
export const APP_MANIFESTS = [
  'package.json',
  'composer.json',
  'pyproject.toml',
  'requirements.txt',
  // Un sous-dossier qui ne contient qu'un compose reste déployable (D1).
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

export function isMonorepo(ctx: DetectionContext): boolean {
  if (MONOREPO_MARKERS.some((file) => ctx.hasRepo(file))) return true;

  const raw = ctx.readRepo('package.json');
  if (!raw) return false;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return false;
    const workspaces = (parsed as { workspaces?: unknown }).workspaces;
    return Array.isArray(workspaces) || (typeof workspaces === 'object' && workspaces !== null);
  } catch {
    return false;
  }
}

/** Profondeur historique de `detect()` : deux niveaux sous la racine (`apps/web`). */
export const DEFAULT_DISCOVERY_DEPTH = 2;

export interface DiscoverAppsOptions {
  /**
   * Profondeur maximale (en segments de dossier) sous `root`. `detect()` garde
   * 2 ; `detectApplications()` utilise 3 pour couvrir `apps/packages/foo`.
   */
  maxDepth?: number;
}

/** Borne une profondeur demandée à un entier raisonnable (≥ 1). */
function normalizeDepth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_DISCOVERY_DEPTH;
  return Math.max(1, Math.trunc(value));
}

/**
 * Enumerate directories at `options.maxDepth` (2 by default) relative to root
 * that directly contain an application manifest. Results are sorted for
 * determinism. Ignored segments are already filtered by `normalizeFiles()`;
 * callers that pass a raw snapshot should filter with `isIgnoredPath()`.
 */
export function discoverApps(
  files: readonly string[],
  root: string,
  options: DiscoverAppsOptions = {},
): string[] {
  const prefix = root === '' ? '' : `${root}/`;
  const maxDepth = normalizeDepth(options.maxDepth);
  const apps = new Set<string>();

  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const relative = file.slice(prefix.length);
    const parts = relative.split('/');
    const basename = parts[parts.length - 1];
    if (!basename || !APP_MANIFESTS.includes(basename)) continue;

    const directoryParts = parts.slice(0, -1);
    if (directoryParts.length < 1 || directoryParts.length > maxDepth) continue;

    const directory = directoryParts.join('/');
    if (directory === '') continue;
    apps.add(root === '' ? directory : `${root}/${directory}`);
  }

  return [...apps].sort((a, b) => a.localeCompare(b));
}

/** Compute the relative path back to the repository root, e.g. "apps/web" -> "../..". */
export function repoRootFromApp(appPath: string): string {
  const depth = appPath.split('/').filter(Boolean).length;
  if (depth === 0) return '';
  return Array.from({ length: depth }, () => '..').join('/');
}
