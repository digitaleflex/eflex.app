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
