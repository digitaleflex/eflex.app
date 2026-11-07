# Feuille de route — issues à créer

Ces fichiers sont des brouillons d'issues GitHub, issus de l'analyse du projet. Chaque fichier commence par une ligne `# Titre`, et le reste constitue le corps de l'issue.

## Ordre recommandé

| # | Priorité | Sujet | Dépend de |
|---|---|---|---|
| 03 | P1 (rapide) | [Renderer : couvrir tous les frameworks détectés](./03-renderer-tous-frameworks.md) | — |
| 04 | P0 sécurité | [Chiffrer les variables d'environnement](./04-chiffrer-variables-env.md) | — |
| 05 | P0 sécurité | [Inscription explicite + vérification d'email](./05-inscription-verification-email.md) | — |
| 01 | P0 | [Intégrer le détecteur dans le portail](./01-integrer-detecteur-portail.md) | — |
| 02 | P0 | [Déployer à partir du BuildPlan](./02-deployer-depuis-buildplan.md) | 01, 03 |
| 06 | P1 | [Déploiements asynchrones via Redis](./06-file-deploiement-redis.md) | 02 |
| 07 | P1 | [GitHub App, dépôts privés, webhooks](./07-github-app-webhooks.md) | 06 |
| 08 | P2 | [Singleton Prisma, schéma unique, CI](./08-prisma-ci-qualite.md) | — |
| 09 | P2 | [Nettoyage du dépôt](./09-nettoyage-depot.md) | — |

## Publier les issues sur GitHub

Avec le CLI `gh` authentifié sur le dépôt :

```bash
./docs/issues/create-issues.sh
```

Le script crée une issue par fichier `NN-*.md`. Les références `#01`, `#02`… des brouillons renvoient aux numéros de fichier, pas aux numéros d'issue GitHub : ajustez-les après création si besoin.
