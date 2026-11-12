import { describe, expect, it } from 'vitest'
import { diagnoseFailure } from '@/lib/deployment-diagnosis'

describe('deployment-diagnosis', () => {
  it('ne renvoie rien hors échec ou sans journal', () => {
    expect(diagnoseFailure({ status: 'live', logs: 'error', projectId: 'p' })).toBeNull()
    expect(diagnoseFailure({ status: 'failed', logs: '', projectId: 'p' })).toBeNull()
    expect(diagnoseFailure({ status: 'failed', logs: '   ', projectId: 'p' })).toBeNull()
  })

  it('détecte une variable manquante', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Error: required environment variable DATABASE_URL not set',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Une variable d'environnement semble manquante.",
      action: { label: 'Ouvrir les variables', href: '/dashboard/projects/p1?tab=variables' },
    })
  })

  it('détecte un problème de port', () => {
    const d = diagnoseFailure({ status: 'failed', logs: 'No open ports detected', projectId: 'p1' })
    expect(d).toEqual({
      cause: "Le port d'écoute de l'application n'a pas été détecté.",
      action: { label: 'Corriger le port', href: '/dashboard/projects/p1/settings' },
    })
  })

  it("détecte un manque d'espace disque", () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Error response from daemon: write /var/lib/docker/tmp/docker-builder123: no space left on device',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "L'espace disque du serveur de build ou d'exécution semble insuffisant.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un quota disque dépassé', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'tar: ./node_modules/.cache: Cannot write: Disk quota exceeded\nError: EDQUOT: disk quota exceeded, write',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "L'espace disque du serveur de build ou d'exécution semble insuffisant.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un manque de mémoire', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "La construction ou l'exécution semble avoir manqué de mémoire.",
      action: { label: 'Voir le plan', href: '/dashboard/organization' },
    })
  })

  it('détecte un dépôt inaccessible', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'fatal: could not read from remote repository.\nPlease make sure you have the correct access rights',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Le dépôt semble inaccessible (privé ou droits insuffisants).",
      action: { label: 'Vérifier la connexion Git', href: '/dashboard/projects/p1/settings' },
    })
  })

  it('détecte un lockfile npm désynchronisé', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: `npm error code EUSAGE
npm error \`npm ci\` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with \`npm install\` before continuing.`,
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: 'Le fichier de verrouillage des dépendances ne correspond pas au gestionnaire de paquets.',
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un lockfile pnpm obsolète (frozen-lockfile)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with package.json',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('verrouillage')
  })

  it('détecte un lockfile yarn obsolète', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'error Your lockfile needs to be updated, but yarn was run with `--frozen-lockfile`.',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('verrouillage')
  })

  it('détecte une dépendance pip introuvable', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: `ERROR: Could not find a version that satisfies the requirement django==9.9.9 (from versions: 4.2, 5.0)
ERROR: No matching distribution found for django==9.9.9`,
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: 'La résolution des dépendances a échoué (version introuvable ou contraintes incompatibles).',
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte des contraintes Composer impossibles à résoudre', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: `Loading composer repositories with package information
Your requirements could not be resolved to an installable set of packages.

  Problem 1
    - Root composer.json requires laravel/framework ^12.0, found laravel/framework[11.0.0]`,
      projectId: 'p1',
    })
    expect(d?.cause).toContain('résolution des dépendances')
  })

  it('détecte une gem Bundler introuvable', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: "Could not find gem 'rails (= 9.0.0)' in rubygems repository https://rubygems.org/ or installed locally.",
      projectId: 'p1',
    })
    expect(d?.cause).toContain('résolution des dépendances')
  })

  it('détecte une erreur réseau lors du téléchargement des dépendances', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: `npm ERR! code ETIMEDOUT
npm ERR! errno ETIMEDOUT
npm ERR! network request to https://registry.npmjs.org/react/-/react-18.3.1.tgz failed, reason: connect ETIMEDOUT`,
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: 'Le téléchargement des dépendances a échoué (erreur réseau).',
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte une résolution DNS impossible pour les dépendances', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'error An unexpected error occurred: "https://registry.yarnpkg.com/react: getaddrinfo EAI_AGAIN registry.yarnpkg.com".',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('réseau')
  })

  it("détecte un délai d'attente réseau explicite lors d'un téléchargement", () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'dial tcp 104.16.0.35:443: i/o timeout while fetching https://registry.npmjs.org/express',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('réseau')
  })

  it('détecte un Dockerfile introuvable', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'failed to read dockerfile: open /app/Dockerfile: no such file or directory',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: 'Le Dockerfile est introuvable ou son chemin est incorrect.',
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un fichier manquant lors d’un COPY Docker', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Step 5/12 : COPY package-lock.json ./\nCOPY failed: file not found in build context or excluded by .dockerignore: stat package-lock.json: file does not exist',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Un fichier référencé pendant la construction est introuvable (COPY/ADD).",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte une image de base introuvable', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'failed to solve: python:3.99-slim: failed to resolve source metadata for docker.io/library/python:3.99-slim: docker.io/library/python:3.99-slim: not found',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "L'image de base du conteneur est introuvable ou inaccessible.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un échec de chargement des métadonnées d’image (BuildKit)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'ERROR [internal] load metadata for docker.io/library/node:22-alpine: failed to do request: Head "https://registry-1.docker.io/v2/library/node/manifests/22-alpine": dial tcp: lookup registry-1.docker.io: i/o timeout',
      projectId: 'p1',
    })
    expect(d?.cause).toContain("image de base")
  })

  it('détecte une commande de démarrage manquante', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Nixpacks build failed\nError: No start command could be found',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Aucune commande de démarrage n'a été détectée pour l'application.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte une commande de démarrage manquante (Nixpacks "Please specify a start command")', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: '╔══════════════════════ Nixpacks v1.21.2 ══════════════════════╗\n║ setup      │ nodejs_20                                       ║\n║ build      │ npm run build                                   ║\n╚══════════════════════════════════════════════════════════════╝\nError: Please specify a start command',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Aucune commande de démarrage n'a été détectée pour l'application.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it("détecte un build Nixpacks/buildpack qui ne peut pas déterminer comment construire", () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Nixpacks build failed\nError: could not determine how to build the app',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Le système de build (Nixpacks/buildpack) n'a pas pu déterminer comment construire l'application.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('ne confond pas des phases Nixpacks informatives avec un échec de détection', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Nixpacks v1.21.2\nsetup      │ nodejs_20\nbuild      │ npm run build\nstart      │ npm start\nDone in 12s',
      projectId: 'p1',
    })
    expect(d).toBeNull()
  })

  it('détecte un outil manquant (composer: command not found)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: '/bin/sh: 1: composer: command not found\nThe command "composer install --no-dev" returned a non-zero code: 127',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Un outil requis pour la construction ou le démarrage est introuvable dans l'environnement.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un outil manquant (bundler: command not found)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'sh: 1: bundler: command not found',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('outil requis')
  })

  it('détecte un outil manquant (php: command not found)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'bash: php: command not found',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('outil requis')
  })

  it('détecte un module Go principal introuvable', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'go: cannot find main module, but found .git/config in /app\n\tto create a module there, run:\n\tcd .. && go mod init',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Le module Go principal est introuvable (fichier go.mod manquant ou contexte de build incorrect).",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un module Python manquant (ModuleNotFoundError)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Traceback (most recent call last):\n  File "/app/main.py", line 1, in <module>\n    import fastapi\nModuleNotFoundError: No module named \'fastapi\'',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Un module Python requis est introuvable au démarrage ou à l'exécution.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte une classe Java introuvable au démarrage', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Error: Could not find or load main class com.example.Application\nCaused by: java.lang.ClassNotFoundException: com.example.Application',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Une classe Java requise est introuvable au démarrage.",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un refus d’accès au socket Docker', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Got permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Post "http://%2Fvar%2Frun%2Fdocker.sock/v1.24/build": dial unix /var/run/docker.sock: connect: permission denied',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "L'accès au démon Docker a été refusé (socket ou permissions insuffisantes).",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it("détecte une erreur d'architecture (exec format error)", () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'standard_init_linux.go:228: exec user process caused: exec format error',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Le binaire exécuté est incompatible avec l'architecture du serveur (exec format error).",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('détecte un port déjà utilisé au démarrage (EADDRINUSE)', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'Error: listen EADDRINUSE: address already in use 0.0.0.0:3000\n    at Server.setupListenHandle [as _listen2] (node:net:1904:16)',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Le port demandé est déjà utilisé au démarrage de l'application.",
      action: { label: 'Corriger le port', href: '/dashboard/projects/p1/settings' },
    })
  })

  it('détecte un refus de permission pendant la construction', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: "npm ERR! Error: EACCES: permission denied, mkdir '/.npm'",
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: "Une opération de construction a échoué faute de permissions (accès refusé).",
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('ne confond pas un refus de permission git avec une erreur de build', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'git@github.com: Permission denied (publickey).',
      projectId: 'p1',
    })
    expect(d?.cause).toContain('inaccessible')
  })

  it('détecte un échec de build générique', () => {
    const d = diagnoseFailure({
      status: 'failed',
      logs: 'npm ERR! code 1\nCommand failed with exit code 1',
      projectId: 'p1',
    })
    expect(d).toEqual({
      cause: 'La commande de build a échoué.',
      action: { label: 'Voir les journaux', href: '/dashboard/projects/p1?tab=logs' },
    })
  })

  it('ne diagnostique pas un journal sans motif connu', () => {
    expect(
      diagnoseFailure({ status: 'failed', logs: 'quelque chose de totalement différent', projectId: 'p1' }),
    ).toBeNull()
  })
})
