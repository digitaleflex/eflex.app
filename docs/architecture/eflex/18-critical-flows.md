# 18 — Flux critiques de bout en bout

Ce document décrit les interactions entre couches ; il complète les contrats API et les runbooks techniques détaillés.

## A. Premier déploiement

1. Le développeur crée un projet dans Experience Layer.
2. Tenant Layer vérifie l'organisation et les droits.
3. Control Plane connecte le dépôt GitHub et crée le projet.
4. Source & Intelligence récupère un snapshot et produit un BuildPlan.
5. Le développeur valide les choix ambigus.
6. Orchestration crée un job asynchrone idempotent.
7. Build Plane construit l'image dans un environnement limité (ou utilise le chemin actuel Coolify tant que le build séparé n'est pas activé).
8. Artifact Layer enregistre une référence immuable lorsque le pipeline séparé est en service.
9. Runtime/Coolify déploie.
10. Network Layer configure domaine et TLS.
11. Observability vérifie l'application.
12. Le Control Plane marque le déploiement LIVE seulement selon les critères de santé définis et notifie l'utilisateur.

## B. Push GitHub / redéploiement

Webhook signé → validation du dépôt/branche/commit → déduplication → job → analyse/build du commit exact → déploiement → health check → historique et notification.

Un push répété ou une livraison webhook en double ne doit pas créer plusieurs déploiements concurrents pour le même projet.

## C. Build échoué

Job échoue → diagnostics corrélés sont persistés → secrets masqués → nouvelle version non promue → version précédente reste en place si possible → utilisateur voit l'étape en échec et l'action suivante recommandée.

## D. Incident d'application

Probe externe ou contrôle runtime détecte une anomalie → confirmation et déduplication → incident associé au projet → notification → ticket/intervention → vérification du rétablissement → rapport.

## E. Sauvegarde / restauration

Scheduler → backup adapter → dump/snapshot cohérent → chiffrement → stockage indépendant → vérification → résultat historisé. Pour la restauration : sauvegarde sélectionnée → vérification → environnement isolé → restore test → validation → approbation avant restauration de production.

## F. Demande d'assistance code

Le client sélectionne un projet et décrit sa demande → ticket rattaché au contexte technique → E-FLEX qualifie le périmètre et le coût → intervention autorisée sur le dépôt/branche → revue et test → déploiement identifié → résultat et temps passé inscrits au ticket.

Ne pas effectuer de modification destructive du code ou de la production sans autorisation et traçabilité convenables.
