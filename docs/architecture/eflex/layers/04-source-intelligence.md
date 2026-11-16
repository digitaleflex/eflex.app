# Layer 04 — Source & Intelligence Layer

## Rôle

Analyser un dépôt sans exécuter son code et produire un plan de déploiement déterministe, inspectable et validable.

## État actuel

**En place :**
- `packages/detector` : snapshot de dépôt → DetectionResult / BuildPlan.
- `packages/renderer` : plans → artefacts et configuration de déploiement.
- `portail/src/lib/repo-analysis.ts` récupère les éléments nécessaires via GitHub.
- `eflex.json`, Dockerfile et Compose permettent des configurations explicites.
- Tests et fixtures du détecteur existent.

## Hiérarchie de configuration

Respecter la priorité implémentée et documentée dans le détecteur : configuration explicite `eflex.json`, Compose fourni, Dockerfile, règles de monorepo et détection conventionnelle selon les cas décrits dans les contrats actuels. Ne pas redéfinir cette priorité sans tests et mise à jour du schéma.

## Pipeline

1. Connecter le dépôt et sélectionner une référence.
2. Lire un snapshot limité et validé.
3. Détecter les manifests, frameworks, gestionnaires et candidats d'app.
4. Produire des preuves, confiance, avertissements et questions.
5. Produire le BuildPlan.
6. Générer les artefacts déterministes avec le renderer.
7. Faire valider les choix incertains avant le déploiement.

## Limites à conserver visibles

- La détection n'est pas une certification d'exécution.
- Certains monorepos ou workspaces restent limités.
- Les builds natifs, extensions système et scripts spécifiques peuvent nécessiter un Dockerfile ou `eflex.json`.
- Les plans multi-services générés sans Compose fourni sont actuellement refusés par le worker.
- Un Compose fourni est la description de référence de la stack et doit être audité avant exécution.
- Un dépôt qui fournit son propre Dockerfile prend le contrôle du build correspondant.

## Travaux

Ne pas développer un second détecteur. Ajouter des fixtures et tests de bout en bout issus des dépôts réels des clients : Next.js, Laravel/Symfony, Python, Node/NestJS et Compose multi-services. Corriger chaque échec identifié et documenter les versions/limites réellement testées.

## Critères d'acceptation

- Même snapshot + même version du détecteur = même plan.
- Aucun code du dépôt ne s'exécute pendant l'analyse.
- Les plans invalides/incomplets produisent des messages actionnables.
- Aucun secret n'est contenu dans le BuildPlan ou les artefacts publics.
- Toute stack annoncée « supportée » dispose d'un test pertinent et d'une procédure de configuration.
