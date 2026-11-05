import type { Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE } from '../confidence.js';

const DOCKERFILE_CANDIDATES = ['Dockerfile', 'docker/Dockerfile'];
const KNOWN_MANIFESTS = [
  'package.json',
  'composer.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'artisan',
  'index.html',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
];

/** Read the first valid port from EXPOSE instructions, if any. */
export function parseExposedPort(dockerfile: string): number | null {
  for (const line of dockerfile.split(/\r?\n/)) {
    const match = line.match(/^\s*EXPOSE\s+(.+?)\s*$/i);
    if (!match || !match[1]) continue;
    for (const token of match[1].split(/\s+/)) {
      const rawPort = token.split('/')[0];
      if (!rawPort) continue;
      const port = Number.parseInt(rawPort, 10);
      if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
    }
  }
  return null;
}

/** Dockerfile at repo root or docker/Dockerfile: opaque, user-controlled build. */
export function detectDocker(ctx: DetectionContext): Candidate | null {
  const dockerfile = DOCKERFILE_CANDIDATES.find((file) => ctx.has(file));
  if (!dockerfile) return null;

  const content = ctx.read(dockerfile) ?? '';
  const port = parseExposedPort(content) ?? 3000;
  const manifests = KNOWN_MANIFESTS.filter((file) => ctx.has(file));

  const reasons = [`\`${dockerfile}\` détecté à la racine du dépôt.`];
  if (manifests.length > 0) {
    reasons.push(`Manifeste(s) détecté(s) pour information : ${manifests.map((file) => `\`${file}\``).join(', ')}.`);
  }
  if (port !== 3000) {
    reasons.push(`Port ${port} lu depuis l'instruction \`EXPOSE\`.`);
  }

  return {
    framework: 'docker',
    plan: {
      version: 1,
      framework: 'docker',
      runtime: 'docker@1',
      root: '',
      port,
    },
    confidence: BASE_CONFIDENCE.docker,
    reasons,
    warnings: [
      'Aucun autoscaling ni health check n\'est déduit d\'un Dockerfile : déclarez-les dans `eflex.json`.',
    ],
  };
}
