import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import {
  BASE_CONFIDENCE,
  UNKNOWN_PYTHON_CONFIDENCE,
  scoreConfidence,
} from '../confidence.js';
import { extractRequiresPython, pythonRuntime } from '../versions.js';

const PYTHON_MANIFESTS = ['pyproject.toml', 'requirements.txt', 'Pipfile'];

function firstSegment(path: string): string | null {
  const [first] = path.split('/');
  return first && first.length > 0 ? first : null;
}

function resolveAsgiModule(ctx: DetectionContext, files: readonly string[]): { module: string; found: boolean } {
  if (ctx.has('main.py')) return { module: 'main:app', found: true };
  if (ctx.has('app.py')) return { module: 'app:app', found: true };

  for (const file of files) {
    if (!/^[^/]+\/main\.py$/.test(file)) continue;
    const directory = firstSegment(file);
    if (directory && ctx.has(`${directory}/__init__.py`)) {
      return { module: `${directory}.main:app`, found: true };
    }
  }

  return { module: 'app:app', found: false };
}

function resolveWsgiModule(ctx: DetectionContext): { entry: string; found: boolean } {
  if (ctx.has('app.py')) return { entry: 'app:app', found: true };
  if (ctx.has('main.py')) return { entry: 'main:app', found: true };
  return { entry: 'app:app', found: false };
}

function resolveDjangoProject(files: readonly string[]): string | null {
  const wsgi = files.find((file) => /^[^/]+\/wsgi\.py$/.test(file));
  if (wsgi) return firstSegment(wsgi);

  const settings = files.find((file) => /^[^/]+\/settings\.py$/.test(file));
  if (settings) return firstSegment(settings);

  return null;
}

/** Python: FastAPI/uvicorn, Flask, Django, or an unknown WSGI app. */
export function detectPython(ctx: DetectionContext): Candidate | null {
  const manifests = PYTHON_MANIFESTS.filter((file) => ctx.has(file));
  const hasManage = ctx.has('manage.py');
  if (manifests.length === 0 && !hasManage) return null;

  const texts = manifests.map((file) => ctx.read(file) ?? '').join('\n').toLowerCase();
  const files = ctx.list();
  const hasFastApi = /\bfastapi\b/.test(texts) || /\buvicorn\b/.test(texts);
  const hasFlask = /\bflask\b/.test(texts);
  const hasDjango = /\bdjango\b/.test(texts) || hasManage;

  const version = pythonRuntime({
    pythonVersionFile: ctx.has('.python-version') ? ctx.read('.python-version') : null,
    runtimeTxt: ctx.has('runtime.txt') ? ctx.read('runtime.txt') : null,
    requiresPython: extractRequiresPython(ctx.read('pyproject.toml')),
  });

  const install = manifests.includes('requirements.txt')
    ? 'pip install -r requirements.txt'
    : manifests.includes('Pipfile')
      ? 'pipenv install --deploy'
      : manifests.includes('pyproject.toml')
        ? 'pip install .'
        : undefined;

  let label = 'Python';
  let start = 'gunicorn main:app';
  let base = UNKNOWN_PYTHON_CONFIDENCE;
  let missingEntrypoint = false;
  let warning: string | null = null;
  const reasons: string[] = [];

  if (manifests.length > 0) {
    reasons.push(`Manifeste(s) Python détecté(s) : ${manifests.map((file) => `\`${file}\``).join(', ')}.`);
  }
  if (hasManage) reasons.push('Fichier `manage.py` détecté.');

  if (hasFastApi) {
    label = 'FastAPI';
    const asgi = resolveAsgiModule(ctx, files);
    start = `uvicorn ${asgi.module} --host 0.0.0.0 --port 8000`;
    base = BASE_CONFIDENCE.python;
    missingEntrypoint = !asgi.found;
  } else if (hasFlask) {
    label = 'Flask';
    const wsgi = resolveWsgiModule(ctx);
    start = `gunicorn ${wsgi.entry}`;
    base = BASE_CONFIDENCE.python;
    missingEntrypoint = !wsgi.found;
  } else if (hasDjango) {
    label = 'Django';
    const project = resolveDjangoProject(files);
    start = `gunicorn ${project ?? 'config'}.wsgi:application`;
    base = BASE_CONFIDENCE.python;
    missingEntrypoint = project === null;
  } else {
    warning = 'Aucun framework Python reconnu : commande de démarrage à confirmer.';
  }

  const plan: BuildPlan = {
    version: 1,
    framework: 'python',
    runtime: version.runtime,
    root: '',
    ...(install ? { install } : {}),
    start,
    port: 8000,
  };

  reasons.push(`Stack ${label} identifiée.`);
  reasons.push(`Version Python retenue : ${version.version}.`);

  const warnings: string[] = [];
  if (warning) warnings.push(warning);
  if (missingEntrypoint) {
    warnings.push('Point d\'entrée Python introuvable : la commande de démarrage doit être confirmée.');
  }

  return {
    framework: 'python',
    plan,
    confidence: scoreConfidence(base, {
      lockfile: ctx.hasLockfile(),
      pinnedRuntime: version.pinned,
      missingEntrypoint,
    }),
    reasons,
    warnings,
  };
}
