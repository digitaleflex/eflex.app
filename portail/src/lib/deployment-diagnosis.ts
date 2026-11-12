/**
 * Diagnostic heuristique des échecs de déploiement, en français.
 * Ne renvoie une cause que sur des motifs observables ; sinon null (aucune invention).
 */

export type DiagnosisAction = { label: string; href: string }

export interface Diagnosis {
  cause: string
  action: DiagnosisAction
}

type Rule = {
  id: string
  test: (text: string) => boolean
  cause: string
  action: (projectId: string) => DiagnosisAction
}

const RULES: Rule[] = [
  {
    id: 'repo-private',
    test: (t) =>
      /repository not found|authentication failed|permission denied \(publickey\)|could not read from remote repository|fatal: could not read|Host key verification failed/i.test(
        t,
      ),
    cause: "Le dépôt semble inaccessible (privé ou droits insuffisants).",
    action: (id) => ({ label: 'Vérifier la connexion Git', href: `/dashboard/projects/${id}/settings` }),
  },
  {
    id: 'missing-env',
    test: (t) =>
      (/\b(missing|undefined|not set|required)\b/i.test(t) &&
        /\b(env|environment|variable|secret)\b/i.test(t)) ||
      (/process\.env\.[A-Z0-9_]+/.test(t) && /(undefined|missing)/i.test(t)),
    cause: "Une variable d'environnement semble manquante.",
    action: (id) => ({ label: 'Ouvrir les variables', href: `/dashboard/projects/${id}?tab=variables` }),
  },
  {
    id: 'port',
    test: (t) =>
      /no (open )?ports? detected|port .*not (found|listening)|exposed port|health ?check.*(fail|timeout)/i.test(
        t,
      ),
    cause: "Le port d'écoute de l'application n'a pas été détecté.",
    action: (id) => ({ label: 'Corriger le port', href: `/dashboard/projects/${id}/settings` }),
  },
  {
    id: 'disk-space',
    test: (t) =>
      /no space left on device|\bENOSPC\b|\bEDQUOT\b|disk quota exceeded|insufficient (disk )?space|write .*no space left|not enough (disk )?space/i.test(
        t,
      ),
    cause: "L'espace disque du serveur de build ou d'exécution semble insuffisant.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'oom',
    test: (t) =>
      /out of memory|oom|killed process|exit code 137|javascript heap out of memory|Cannot allocate memory/i.test(
        t,
      ),
    cause: "La construction ou l'exécution semble avoir manqué de mémoire.",
    action: () => ({ label: 'Voir le plan', href: '/dashboard/organization' }),
  },
  {
    id: 'lockfile-mismatch',
    test: (t) =>
      /npm ci`? can only install packages when your package\.json and package-lock\.json|npm ERR! code EUSAGE/i.test(
        t,
      ) ||
      /ERR_PNPM_OUTDATED_LOCKFILE|Cannot install with "frozen-lockfile" because pnpm-lock\.yaml/i.test(t) ||
      /Your lockfile needs to be updated, but yarn was run with `--frozen-lockfile`|YN0028/i.test(t) ||
      /lockfile.*(out of date|needs to be updated)|package-lock\.json.*out of sync/i.test(t),
    cause: 'Le fichier de verrouillage des dépendances ne correspond pas au gestionnaire de paquets.',
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'deps-resolution',
    test: (t) =>
      /Could not find a version that satisfies the requirement|No matching distribution found for/i.test(t) ||
      /Your requirements could not be resolved to an installable set of packages/i.test(t) ||
      ((/because these conflicting requirements exist|SolverProblemError/i.test(t)) && /poetry|pyproject/i.test(t)) ||
      /Could not find gem '[^']+' in|Bundler::GemNotFound/i.test(t),
    cause: 'La résolution des dépendances a échoué (version introuvable ou contraintes incompatibles).',
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'dockerfile-missing',
    test: (t) =>
      /failed to read dockerfile|Cannot locate specified Dockerfile|unable to prepare context: unable to evaluate symlinks in Dockerfile path/i.test(
        t,
      ) ||
      /open .*Dockerfile: no such file or directory/i.test(t),
    cause: 'Le Dockerfile est introuvable ou son chemin est incorrect.',
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'copy-missing',
    test: (t) =>
      /COPY failed:.*(file not found|not found)|ADD failed:.*(file not found|not found)/i.test(t) ||
      /failed to compute cache key:.*not found/i.test(t),
    cause: "Un fichier référencé pendant la construction est introuvable (COPY/ADD).",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'base-image-missing',
    test: (t) =>
      /manifest unknown|failed to resolve source metadata|pull access denied.*repository does not exist/i.test(t) ||
      /not found: manifest unknown|repository .* not found/i.test(t) ||
      /ERROR \[internal\] load metadata for/i.test(t),
    cause: "L'image de base du conteneur est introuvable ou inaccessible.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'network-deps',
    test: (t) =>
      /npm ERR!.*network|ERR_PNPM_FETCH|YARN_NETWORK_ERROR/i.test(t) ||
      (/\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b/i.test(t) &&
        /(registry|fetch|download|resolve|getaddrinfo|Could not resolve host|network)/i.test(t)) ||
      /Could not resolve host|Temporary failure in (resolving|name resolution)|Failed to fetch .*packages?/i.test(
        t,
      ) ||
      (/\b(i\/o timeout|timed out)\b/i.test(t) &&
        /(registry|fetch|download|resolve|getaddrinfo|dial tcp|Could not resolve host|packages?)/i.test(t)),
    cause: 'Le téléchargement des dépendances a échoué (erreur réseau).',
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'nixpacks-build-detect',
    test: (t) =>
      /could not determine how to build/i.test(t) ||
      (/nixpacks/i.test(t) &&
        /\b(Error|failed|unable)\b/i.test(t) &&
        /\b(detect|detected|determine|plan|provider|generate a build plan)\b/i.test(t) &&
        !/start command/i.test(t)),
    cause: "Le système de build (Nixpacks/buildpack) n'a pas pu déterminer comment construire l'application.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'start-command-missing',
    test: (t) =>
      /No start command (could be found|was found)|could not determine how to start|Missing start command|Procfile declares types\s*->\s*\(none\)|Error: Please specify a start command/i.test(
        t,
      ),
    cause: "Aucune commande de démarrage n'a été détectée pour l'application.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'missing-tooling',
    test: (t) =>
      /\b(bundler|bundle|composer|php): command not found\b/i.test(t) ||
      /\bsh: \d+: (bundler|bundle|composer|php): not found\b/i.test(t),
    cause: "Un outil requis pour la construction ou le démarrage est introuvable dans l'environnement.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'go-module-missing',
    test: (t) => /go: cannot find main module/i.test(t),
    cause: "Le module Go principal est introuvable (fichier go.mod manquant ou contexte de build incorrect).",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'python-module-missing',
    test: (t) =>
      /\bModuleNotFoundError: No module named ['"][^'"]+['"]/i.test(t) ||
      /\bImportError: No module named ['"]?[^\s'"]+['"]?/i.test(t),
    cause: "Un module Python requis est introuvable au démarrage ou à l'exécution.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'java-class-missing',
    test: (t) =>
      /\bjava\.lang\.ClassNotFoundException\b/i.test(t) ||
      /\bError: Could not find or load main class\b/i.test(t),
    cause: "Une classe Java requise est introuvable au démarrage.",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'docker-socket-permission',
    test: (t) =>
      /permission denied while trying to connect to the Docker daemon socket/i.test(t) ||
      /Got permission denied while trying to connect to the Docker daemon socket/i.test(t) ||
      /Cannot connect to the Docker daemon .* permission denied/i.test(t),
    cause: "L'accès au démon Docker a été refusé (socket ou permissions insuffisantes).",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'exec-format-error',
    test: (t) => /\bexec format error\b/i.test(t),
    cause: "Le binaire exécuté est incompatible avec l'architecture du serveur (exec format error).",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'port-in-use',
    test: (t) =>
      /\bEADDRINUSE\b/i.test(t) ||
      /\baddress already in use\b/i.test(t) ||
      /listen EADDRINUSE/i.test(t),
    cause: "Le port demandé est déjà utilisé au démarrage de l'application.",
    action: (id) => ({ label: 'Corriger le port', href: `/dashboard/projects/${id}/settings` }),
  },
  {
    id: 'permission-build',
    test: (t) =>
      /\bEACCES\b/i.test(t) ||
      (/\bpermission denied\b/i.test(t) &&
        !/permission denied \(publickey\)|could not read from remote repository/i.test(t) &&
        /(npm|pnpm|yarn|install|build|mkdir|open|write|copy|sh:|\/app|node_modules|cache)/i.test(t)),
    cause: "Une opération de construction a échoué faute de permissions (accès refusé).",
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'build-failed',
    test: (t) =>
      /build (failed|error)|command failed|npm (err|error)|pnpm .*err|yarn .*error|exit code [1-9]/i.test(t),
    cause: 'La commande de build a échoué.',
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
]

/** Retourne un diagnostic uniquement si un motif reconnu est présent. */
export function diagnoseFailure(input: { status: string; logs?: string | null; projectId: string }): Diagnosis | null {
  if (input.status !== 'failed') return null
  const text = (input.logs ?? '').toString()
  if (!text.trim()) return null
  for (const rule of RULES) {
    try {
      if (rule.test(text)) return { cause: rule.cause, action: rule.action(input.projectId) }
    } catch {
      // Un motif défectueux ne doit jamais casser l'affichage.
    }
  }
  return null
}
