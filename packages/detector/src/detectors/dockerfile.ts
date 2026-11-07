import type { BuildPlan, Candidate, DetectionContext, Question } from '../types.js';
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

interface ParsedDockerfile {
  buildArgs: Map<string, string | null>;
  volumes: string[];
  exposedPorts: number[];
  hasWebServer: boolean;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/** Unfold backslash continuations and drop comment-only lines. */
function readInstructions(content: string): string[] {
  const instructions: string[] = [];
  let current = '';

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim().startsWith('#')) continue;

    const hasContinuation = /\\\s*$/.test(line);
    const part = hasContinuation ? line.replace(/\\\s*$/, '') : line;
    const trimmed = part.trim();
    current = current === '' ? trimmed : `${current} ${trimmed}`;

    if (!hasContinuation) {
      if (current !== '') instructions.push(current);
      current = '';
    }
  }

  if (current !== '') instructions.push(current);
  return instructions;
}

function parseVolumeInstruction(rest: string): string[] {
  const trimmed = rest.trim();
  if (trimmed === '') return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item !== '');
      }
    } catch {
      // Not valid JSON: fall back to shell parsing.
    }
  }

  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return tokens.map(unquote).filter((item) => item !== '');
}

function fromReferences(instructions: readonly string[]): Set<string> {
  const references = new Set<string>();
  for (const instruction of instructions) {
    if (!/^FROM\s+/i.test(instruction)) continue;
    for (const match of instruction.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (match[1]) references.add(match[1]);
    }
  }
  return references;
}

function parseDockerfile(content: string): ParsedDockerfile {
  const instructions = readInstructions(content);
  const firstFromIndex = instructions.findIndex((instruction) => /^FROM\s+/i.test(instruction));
  const ignoredByFrom = fromReferences(instructions);

  const buildArgs = new Map<string, string | null>();
  const volumes: string[] = [];
  const exposedPorts: number[] = [];

  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    if (!instruction) continue;

    const argMatch = instruction.match(/^ARG\s+(.+)$/i);
    if (argMatch && argMatch[1]) {
      // ARG before the first FROM builds the base image, not the application.
      if (firstFromIndex === -1 || index < firstFromIndex) continue;

      const body = argMatch[1].trim();
      const equalsIndex = body.indexOf('=');
      const name = (equalsIndex === -1 ? body : body.slice(0, equalsIndex)).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
      if (ignoredByFrom.has(name)) continue;

      if (equalsIndex === -1) {
        if (!buildArgs.has(name)) buildArgs.set(name, null);
      } else {
        buildArgs.set(name, unquote(body.slice(equalsIndex + 1)));
      }
      continue;
    }

    const volumeMatch = instruction.match(/^VOLUME\s+(.+)$/i);
    if (volumeMatch && volumeMatch[1]) {
      volumes.push(...parseVolumeInstruction(volumeMatch[1]));
      continue;
    }

    const exposeMatch = instruction.match(/^EXPOSE\s+(.+)$/i);
    if (exposeMatch && exposeMatch[1]) {
      for (const token of exposeMatch[1].split(/\s+/)) {
        const portMatch = token.match(/^(\d+)(?:-\d+)?(?:\/[a-z]+)?$/i);
        if (!portMatch || !portMatch[1]) continue;
        const port = Number.parseInt(portMatch[1], 10);
        if (Number.isInteger(port) && port >= 1 && port <= 65535) exposedPorts.push(port);
      }
    }
  }

  return {
    buildArgs,
    volumes,
    exposedPorts: [...new Set(exposedPorts)],
    hasWebServer: /(?:^|\W)(nginx|apache2|caddy)(?:\W|$)/i.test(content),
  };
}

/** Read the first valid port from EXPOSE instructions, if any. */
export function parseExposedPort(dockerfile: string): number | null {
  return parseDockerfile(dockerfile).exposedPorts[0] ?? null;
}

/** Dockerfile at repo root or docker/Dockerfile: opaque, user-controlled build. */
export function detectDocker(ctx: DetectionContext): Candidate | null {
  const dockerfile = DOCKERFILE_CANDIDATES.find((file) => ctx.has(file));
  if (!dockerfile) return null;

  const content = ctx.read(dockerfile) ?? '';
  const parsed = parseDockerfile(content);
  const firstPort = parsed.exposedPorts[0] ?? 3000;
  const manifests = KNOWN_MANIFESTS.filter((file) => ctx.has(file));

  const plan: BuildPlan = {
    version: 1,
    framework: 'docker',
    runtime: 'docker@1',
    root: '',
    port: firstPort,
  };
  if (dockerfile !== 'Dockerfile') plan.dockerfile = dockerfile;

  const volumes = [...new Set(parsed.volumes)];
  if (volumes.length > 0) plan.volumes = volumes;

  const buildArgs = new Map<string, string>();
  const questions: Question[] = [];
  for (const [name, value] of parsed.buildArgs) {
    buildArgs.set(name, value ?? '');
    if (value === null) {
      questions.push({
        id: `buildArg.${name}`,
        prompt: `La valeur de l'argument de build « ${name} » est requise au moment du build.`,
        kind: 'text',
      });
    }
  }
  if (buildArgs.size > 0) plan.buildArgs = Object.fromEntries(buildArgs);

  const warnings = [
    'Aucun autoscaling ni health check n\'est déduit d\'un Dockerfile : déclarez-les dans `eflex.json`.',
  ];

  const reasons = [`\`${dockerfile}\` détecté ${dockerfile === 'Dockerfile' ? 'à la racine du dépôt' : 'dans le dépôt'}.`];
  if (manifests.length > 0) {
    reasons.push(`Manifeste(s) détecté(s) pour information : ${manifests.map((file) => `\`${file}\``).join(', ')}.`);
  }
  if (parsed.exposedPorts.length > 0) {
    reasons.push(`Port ${firstPort} lu depuis l'instruction \`EXPOSE\`.`);
  }

  if (parsed.exposedPorts.length > 1) {
    const others = parsed.exposedPorts.slice(1);
    warnings.push(
      `Plusieurs ports sont exposés : le port ${firstPort} est retenu (autres ports : ${others.join(', ')}).`,
    );
  }

  if ((firstPort === 9000 || firstPort === 9001) && !parsed.hasWebServer) {
    warnings.push(
      `Port ${firstPort} détecté : php-fpm seul. Un service web (nginx) est requis pour exposer l'application.`,
    );
  }

  return {
    framework: 'docker',
    plan,
    confidence: BASE_CONFIDENCE.docker,
    reasons,
    warnings,
    ...(questions.length > 0 ? { questions } : {}),
  };
}
