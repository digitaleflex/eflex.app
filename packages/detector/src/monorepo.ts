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

/**
 * Enumerate directories at depth 1 or 2 (relative to root) that directly
 * contain an application manifest. Results are sorted for determinism.
 */
export function discoverApps(files: readonly string[], root: string): string[] {
  const prefix = root === '' ? '' : `${root}/`;
  const apps = new Set<string>();

  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const relative = file.slice(prefix.length);
    const parts = relative.split('/');
    const basename = parts[parts.length - 1];
    if (!basename || !APP_MANIFESTS.includes(basename)) continue;

    const directoryParts = parts.slice(0, -1);
    if (directoryParts.length < 1 || directoryParts.length > 2) continue;

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
