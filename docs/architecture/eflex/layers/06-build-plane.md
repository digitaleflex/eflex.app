# Layer 06 — Build Plane

## Rôle

Construire les images d'application indépendamment des serveurs qui exécutent les applications clientes.

La règle directrice est **Build once, deploy the immutable artifact**.

## État actuel

Le portail déclenche actuellement le build via Coolify. L'intégration du portail ne configure pas encore un serveur de build dédié ni un pipeline de registre séparé pour toutes les voies. L'isolation complète Build Plane / Runtime Plane est donc **à construire**.

## Chemins de build cibles

### A. Applications simples compatibles

Évaluer le Build Server intégré à la version de Coolify utilisée. Son rôle est de compiler sur une machine dédiée, publier l'image, puis laisser le serveur de production la récupérer.

Cette voie n'est pas universelle : la fonction Build Server intégrée de Coolify ne couvre pas les applications Docker Compose selon la documentation produit actuelle. Vérifier la version et la configuration exactes avant activation.

### B. Docker Compose

Pour une stack Compose :
1. récupérer le commit exact ;
2. construire les services qui possèdent un Dockerfile ;
3. pousser chaque image dans un registre ;
4. utiliser un Compose de production qui référence ces images immuables ;
5. demander à Coolify d'orchestrer la stack.

Le pipeline peut démarrer avec GitHub Actions ou un runner dédié utilisant BuildKit. Le code actuel ne doit pas supposer que ce pipeline existe déjà.

## Isolation obligatoire

- Un worker de build ne reçoit pas les secrets de production par défaut.
- Le code du dépôt est considéré comme non fiable.
- Les builds sont limités en CPU, mémoire, disque et durée.
- Le workspace temporaire est nettoyé après succès/échec.
- Le worker n'a pas accès libre au Docker socket des serveurs de production.
- Les tokens de registre sont à durée et portée minimales.
- La concurrence commence à une tâche par worker, puis augmente sur la base de mesures.

## Optimisation

- Cache BuildKit et cache de dépendances.
- Lockfiles et commandes reproductibles.
- Couches stables avant copie du code fréquemment modifié.
- Builds asynchrones.
- Annulation des builds obsolètes lorsque sûr.
- Mesure du temps, CPU, RAM, disque et taux de réussite.

Ne pas réécrire le portail en Go ou Rust pour résoudre une saturation de build. Mesurer d'abord le processus qui consomme les ressources.

## Critères d'acceptation

- Un build intensif ne sature pas le nœud runtime.
- Chaque image correspond à un commit précis.
- Un build échoué ne remplace pas la version actuellement saine.
- Les secrets ne sont ni injectés par défaut dans les builds ni enregistrés dans les logs.
- Les ressources et les durées sont mesurées pour dimensionner les workers.
