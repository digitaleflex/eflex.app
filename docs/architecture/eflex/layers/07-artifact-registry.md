# Layer 07 — Artifact & Registry Layer

## Rôle

Stocker et distribuer les images construites entre le Build Plane et les serveurs Runtime.

## État actuel

Le portail ne configure pas encore une couche de registre dédiée à un pipeline de build séparé dans tous les parcours. Le registre est donc une capacité de l'architecture cible, pas une fonction à annoncer comme pleinement intégrée.

## Décision de départ

Réutiliser un registre OCI existant (par exemple GitHub Container Registry) avec des droits minimum. Ne pas développer ni opérer son propre registre au lancement.

## Contrat d'un artefact

Chaque image doit être associée à :
- organisation et projet propriétaires ;
- commit source ;
- framework/plan et version du builder ;
- date de construction ;
- architecture CPU ;
- tag immuable et digest OCI ;
- résultat et provenance du build.

Le déploiement de production doit référencer un digest ou une version immuable, pas un tag mutable tel que `latest` seul.

## Cycle

Build Worker → publication OCI → vérification d'existence → enregistrement de la référence d'image → Runtime reçoit la référence immuable → politique de rétention conserve les images nécessaires au rollback.

## Sécurité et rétention

- Authentification des pushes/pulls.
- Droits séparés entre build et runtime.
- Pas de token de registre dans le navigateur.
- Scan d'image à introduire selon les moyens et risques.
- Rétention définie ; ne pas supprimer une image utilisée en production ou référencée par un rollback possible.
- Nettoyage des artefacts orphelins avec mode dry-run avant toute suppression.

## Critères d'acceptation

- Chaque déploiement référence une image immuable.
- Le runtime peut récupérer l'image sans accès au dépôt source.
- Les secrets de build n'apparaissent pas dans l'image.
- Les droits de registre sont isolés par environnement/service.
- La rétention ne supprime pas les versions encore nécessaires.
