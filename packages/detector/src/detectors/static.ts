import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, withJsTooling } from './node.js';

const INDEX_NAMES = new Set(['index.html', 'index.htm', 'index.xhtml']);
const COMMON_STATIC_DIRS = ['public', 'www', 'site', 'web', 'docs', 'htdocs', 'public_html'];

interface IndexMatch {
  /** Chemin relatif à la racine de l'application, ou '' si c'est un index à la racine. */
  publish: string;
  /** Chemin réel du fichier trouvé (pour les messages). */
  file: string;
}

function isRootFile(path: string): boolean {
  return !path.includes('/');
}

function isIndexFile(name: string): boolean {
  return INDEX_NAMES.has(name.toLowerCase());
}

function findRootIndex(ctx: DetectionContext): string | null {
  // Priorité : correspondance exacte, puis insensible à la casse.
  if (ctx.has('index.html')) return 'index.html';
  if (ctx.has('index.htm')) return 'index.htm';
  if (ctx.has('index.xhtml')) return 'index.xhtml';

  const rootFiles = ctx.list().filter(isRootFile);
  const match = rootFiles.find((file) => isIndexFile(file));
  return match ?? null;
}

function findNestedIndex(ctx: DetectionContext): IndexMatch | null {
  for (const dir of COMMON_STATIC_DIRS) {
    const exactHtml = `${dir}/index.html`;
    const exactHtm = `${dir}/index.htm`;
    const exactXhtml = `${dir}/index.xhtml`;
    if (ctx.has(exactHtml)) return { publish: dir, file: exactHtml };
    if (ctx.has(exactHtm)) return { publish: dir, file: exactHtm };
    if (ctx.has(exactXhtml)) return { publish: dir, file: exactXhtml };

    const prefix = `${dir}/`;
    const match = ctx
      .list()
      .filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes('/'))
      .find((file) => isIndexFile(file.slice(prefix.length)));
    if (match) return { publish: dir, file: match };
  }
  return null;
}

function listRootHtmlFiles(ctx: DetectionContext): string[] {
  return ctx
    .list()
    .filter(isRootFile)
    .filter((file) => {
      const lower = file.toLowerCase();
      return lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.xhtml');
    })
    .sort((a, b) => a.localeCompare(b));
}

/** A package.json with a build script plus a root index file. */
export function detectStaticBuild(ctx: DetectionContext): Candidate | null {
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  if (typeof buildScript !== 'string' || buildScript.trim().length === 0) return null;

  const indexFile = findRootIndex(ctx);
  if (!indexFile) return null;

  const pm = ctx.packageManager();
  const plan: BuildPlan = {
    version: 1,
    framework: 'static',
    runtime: 'static@1',
    root: '',
    install: installCommand(ctx),
    build: `${pm} run build`,
    publish: 'dist',
    port: 80,
  };

  return withJsTooling(ctx, {
    framework: 'static',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.static, {
      lockfile: ctx.hasJsLockfile(),
    }),
    reasons: [
      `\`package.json\` contient un script \`build\` et \`${indexFile}\` est présent à la racine.`,
      'La sortie est servie en statique avec le runtime `static@1`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  });
}

/** A plain static site without any build step. */
export function detectStaticIndex(ctx: DetectionContext): Candidate | null {
  const rootIndex = findRootIndex(ctx);
  if (rootIndex) {
    const plan: BuildPlan = {
      version: 1,
      framework: 'static',
      runtime: 'static@1',
      root: '',
      port: 80,
    };

    const reasons = [`\`${rootIndex}\` détecté à la racine : site statique sans étape de build.`];
    const warnings: string[] = [];
    const lower = rootIndex.toLowerCase();
    if (lower !== 'index.html' && lower !== 'index.htm') {
      warnings.push(
        `Le fichier d'entrée détecté est \`${rootIndex}\`. Vérifiez que le serveur statique le sert bien comme page d'accueil.`,
      );
    } else if (rootIndex !== 'index.html' && rootIndex !== 'index.htm') {
      warnings.push(
        `Le fichier d'entrée détecté est \`${rootIndex}\` (casse différente de \`index.html\`). Sur Linux, le serveur web est sensible à la casse : renommez-le en \`index.html\` pour éviter une erreur 404 à la racine.`,
      );
    }

    return {
      framework: 'static',
      plan,
      confidence: BASE_CONFIDENCE.static,
      reasons,
      warnings,
    };
  }

  const nested = findNestedIndex(ctx);
  if (nested) {
    const plan: BuildPlan = {
      version: 1,
      framework: 'static',
      runtime: 'static@1',
      root: '',
      publish: nested.publish,
      port: 80,
    };

    return {
      framework: 'static',
      plan,
      confidence: 0.75,
      reasons: [
        `\`${nested.file}\` détecté : site statique sans étape de build.`,
        `Le dossier \`${nested.publish}/\` sera publié tel quel.`,
      ],
      warnings: [
        `Aucun \`index.html\` à la racine, mais un index a été trouvé dans \`${nested.publish}/\`. Vérifiez que ce dossier contient bien tout le site à publier.`,
      ],
    };
  }

  return null;
}

export function hasRootHtmlFiles(ctx: DetectionContext): string[] {
  return listRootHtmlFiles(ctx);
}
