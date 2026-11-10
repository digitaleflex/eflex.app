import type { BuildPlan, Candidate, ComposeContext, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE } from '../confidence.js';

/**
 * Fichiers compose standard reconnus, par ordre de priorité. `docker-compose.*`
 * reste en tête : c'est le nom historique le plus répandu, et `compose.yaml`
 * (spec Compose) n'est retenu que si aucun autre n'existe.
 */
export const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;

interface ServiceOutline {
  name: string;
  /** Ports conteneur déclarés (partie droite de `ports:`). */
  ports: number[];
}

interface KeyValue {
  key: string;
  rest: string;
}

/** Détecte un fichier compose fourni par le dépôt, à la racine de l'application. */
export function detectCompose(ctx: DetectionContext): Candidate | null {
  const file = COMPOSE_FILES.find((candidate) => ctx.has(candidate));
  if (!file) return null;

  const content = ctx.read(file);
  if (content === null) return null;

  const declaredServices = parseComposeServices(content);
  // Un fichier sans section `services` exploitable n'est pas un compose de
  // déploiement : on laisse la détection standard décider (Dockerfile, etc.).
  if (declaredServices.length === 0) return null;
  // Le schéma plafonne la description à 50 services et refuse les doublons :
  // au-delà, on tronque la liste affichée et on prévient, sans inventer ni
  // supprimer de service du fichier.
  const seen = new Set<string>();
  const services = declaredServices
    .filter((service) => {
      if (seen.has(service.name)) return false;
      seen.add(service.name);
      return true;
    })
    .slice(0, 50);

  const primary = primaryService(services);
  const location = `/${file}`;
  const compose: ComposeContext = {
    location,
    services: services.map((service) => service.name),
  };
  if (primary) compose.service = primary.name;

  const plan: BuildPlan = {
    version: 1,
    framework: 'compose',
    runtime: 'docker@1',
    root: '',
    // Port d'écoute public du proxy. Le compose peut exposer autre chose sur
    // le service choisi : Coolify lit le port réel dans le compose.
    port: 80,
    compose,
  };

  const warnings = [
    'Le fichier compose fourni fait foi : la plateforme ne modifie ni les services, ni les commandes, ni les volumes.',
    'Les migrations, les tâches de démarrage et les commandes `postDeploy` ne sont pas exécutées automatiquement : déclarez-les dans le compose (service one-shot avec `restart: no`, par exemple).',
  ];
  if (!/entrypoints\s*[:=][^\n]*websecure/i.test(content)) {
    warnings.push(
      'Le compose doit déclarer lui-même ses labels Traefik (`traefik.http.routers.<nom>.entrypoints=websecure`) : ceux générés par Coolify utilisent l’entrypoint `https`, absent du Traefik de l’hôte.',
    );
  }
  if (hasUnsafeClause(content)) {
    warnings.push(
      'Le compose contient une clause refusée par la plateforme (`privileged`, `network_mode: host` ou montage de la socket Docker) : le déploiement échouera avant tout appel à l’hébergement.',
    );
  }
  if (declaredServices.length > services.length) {
    warnings.push(
      `Le compose déclare ${declaredServices.length} services : seuls les ${services.length} premiers sont affichés dans le plan.`,
    );
  }

  const reasons = [
    `Fichier \`${file}\` détecté ${ctx.root === '' ? 'à la racine du dépôt' : `dans \`${ctx.root}\``}.`,
    `${services.length} service(s) déclaré(s) : ${services.map((service) => `\`${service.name}\``).join(', ')}.`,
  ];
  if (primary) {
    reasons.push(
      `Service public probable : \`${primary.name}\`${primary.ports.length > 0 ? ` (port ${primary.ports.join(', ')})` : ''}.`,
    );
  } else {
    warnings.push(
      'Aucun service HTTP n’a été identifié : le domaine du projet ne sera pas attaché automatiquement.',
    );
  }

  return {
    framework: 'compose',
    plan,
    confidence: BASE_CONFIDENCE.compose,
    reasons,
    warnings,
  };
}

/** Vrai si le compose contient une clause que le portail refuse avant déploiement. */
function hasUnsafeClause(content: string): boolean {
  return (
    /^[\t ]*privileged[\t ]*:[\t ]*true[\t ]*(?:#.*)?$/im.test(content) ||
    /^[\t ]*network_mode[\t ]*:[\t ]*["']?host["']?[\t ]*(?:#.*)?$/im.test(content) ||
    /\/var\/run\/docker\.sock/.test(content)
  );
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

function indentOf(line: string): number {
  const match = /^[\t ]*/.exec(line);
  return match ? match[0].length : 0;
}

function splitKeyValue(text: string): KeyValue | null {
  const quoted = /^(['"])((?:\\.|(?!\1).)*)\1\s*:\s*(.*)$/.exec(text);
  if (quoted && quoted[2] !== undefined) {
    return { key: quoted[2], rest: quoted[3] ?? '' };
  }
  const plain = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*:\s*(.*)$/.exec(text);
  if (plain && plain[1] !== undefined) {
    return { key: plain[1], rest: plain[2] ?? '' };
  }
  return null;
}

function stripComment(value: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

/** Extrait le port conteneur d'une entrée `ports:` (syntaxe courte ou longue). */
function portFromEntry(entry: string): number | null {
  const value = stripComment(unquote(entry.trim()));
  if (value === '') return null;

  const longSyntax = /(?:^|[,{])\s*target\s*:\s*(\d{1,5})/.exec(value);
  if (longSyntax && longSyntax[1]) {
    const port = Number.parseInt(longSyntax[1], 10);
    return port >= 1 && port <= 65535 ? port : null;
  }

  const withoutProtocol = value.split('/')[0] ?? '';
  const parts = withoutProtocol.split(':');
  const last = (parts[parts.length - 1] ?? '').trim();
  const match = /^(\d{1,5})(?:-\d{1,5})?$/.exec(last);
  if (!match || !match[1]) return null;
  const port = Number.parseInt(match[1], 10);
  return port >= 1 && port <= 65535 ? port : null;
}

function portsFromValue(value: string): number[] {
  const cleaned = stripComment(value).trim();
  if (cleaned === '') return [];

  if (cleaned.startsWith('[')) {
    const inner = cleaned.replace(/^\[/, '').replace(/\]$/, '');
    return inner
      .split(',')
      .map((item) => portFromEntry(item))
      .filter((port): port is number => port !== null);
  }

  const port = portFromEntry(cleaned);
  return port === null ? [] : [port];
}

/**
 * Lit l'ossature d'un compose : noms de services et ports conteneur.
 *
 * Volontairement minimal et sans dépendance YAML : le détecteur doit rester
 * déterministe et sans I/O. Seule la carte `services:` est parcourue ; les
 * ancres, les valeurs multi-lignes et les structures exotiques sont ignorées.
 */
export function parseComposeServices(content: string): ServiceOutline[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let servicesIndex = -1;
  let servicesIndent = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indent = indentOf(line);
    const parsed = splitKeyValue(line.slice(indent).trimEnd());
    if (parsed?.key === 'services') {
      servicesIndex = index;
      servicesIndent = indent;
      break;
    }
  }
  if (servicesIndex === -1) return [];

  let childIndent: number | null = null;
  for (let index = servicesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indent = indentOf(line);
    if (indent > servicesIndent) childIndent = indent;
    break;
  }
  if (childIndent === null) return [];

  const services: ServiceOutline[] = [];
  let current: ServiceOutline | null = null;
  let portsIndent = -1;

  for (let index = servicesIndex + 1; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;

    const indent = indentOf(raw);
    if (indent < childIndent) break;

    const text = raw.slice(indent).trimEnd();
    if (indent === childIndent) {
      const parsed = splitKeyValue(text);
      if (!parsed) continue;
      current = { name: unquote(parsed.key), ports: [] };
      services.push(current);
      portsIndent = -1;
      if (parsed.rest.trimStart().startsWith('[')) {
        current.ports.push(...portsFromValue(parsed.rest));
      }
      continue;
    }

    if (!current) continue;

    // Les entrées d'une liste `ports:` sont plus indentées que la clé.
    if (portsIndent !== -1 && indent > portsIndent && text.startsWith('-')) {
      const port = portFromEntry(text.slice(1));
      if (port !== null && !current.ports.includes(port)) current.ports.push(port);
      continue;
    }

    const parsed = splitKeyValue(text);
    if (!parsed) continue;
    if (parsed.key === 'ports') {
      portsIndent = indent;
      for (const port of portsFromValue(parsed.rest)) {
        if (!current.ports.includes(port)) current.ports.push(port);
      }
    } else if (indent <= portsIndent) {
      portsIndent = -1;
    }
  }

  return services;
}

const HTTP_PORT_SCORE = new Map<number, number>([
  [80, 60],
  [8080, 55],
  [8000, 50],
  [3000, 45],
  [5000, 40],
  [443, 35],
  [4000, 30],
  [4200, 25],
  [5173, 20],
  [3001, 15],
]);

const SERVICE_NAME_SCORE: Record<string, number> = {
  web: 60,
  nginx: 55,
  frontend: 50,
  front: 45,
  app: 40,
  api: 35,
  http: 30,
  server: 25,
  proxy: 20,
};

function serviceScore(service: ServiceOutline): number {
  const portScore = service.ports.reduce(
    (best, port) => Math.max(best, HTTP_PORT_SCORE.get(port) ?? 0),
    0,
  );
  return portScore + (SERVICE_NAME_SCORE[service.name.toLowerCase()] ?? 0);
}

/**
 * Choisit le service qui portera le domaine public : port HTTP reconnu, puis
 * nom évocateur, puis ordre du fichier. Aucun candidat → aucun domaine.
 */
export function primaryService(services: readonly ServiceOutline[]): ServiceOutline | null {
  let best: ServiceOutline | null = null;
  let bestScore = 0;
  for (const service of services) {
    const score = serviceScore(service);
    if (score > bestScore) {
      best = service;
      bestScore = score;
    }
  }
  return best;
}
