# 17 — Topologie d'infrastructure

## Règle de conception

Les couches logiques ne correspondent pas à autant de serveurs. La topologie physique doit évoluer selon les mesures de charge, les risques et les revenus des clients. Ne pas acheter quatre VPS avant d'avoir prouvé qu'ils sont nécessaires.

## Topologie actuelle

Le portail, son PostgreSQL et Redis sont documentés comme un déploiement sur un VPS derrière le Traefik de l'hôte. Coolify est utilisé comme service de déploiement/runtime via son API. Les rôles et tailles exacts des machines doivent être inventoriés dans le runbook d'exploitation ; ce document ne suppose pas de capacité CPU/RAM non vérifiée.

## Topologie cible progressive

| Nœud logique | Responsabilité | Déclencheur d'investissement |
|---|---|---|
| Node A — Control | Portail, API, DB plateforme, Redis/BullMQ | Renforcer/isoler si charge ou criticité l'exige |
| Node B — Build | Workers de build, BuildKit, cache temporaire | Builds saturent la production ou durées/coûts justifient la séparation |
| Node C — Runtime | Applications et bases clientes | Capacité de production mesurée et vendue |
| Node D — Runtime / Recovery | Capacité supplémentaire ou reprise | Charge, engagements de reprise et revenus le justifient |
| External Storage | Sauvegardes hors site et artefacts | À mettre en place avant de promettre la protection des données |

Node D ne constitue pas à lui seul une haute disponibilité. La HA exige redondance des dépendances, routage/failover, réplication ou stratégie de données, tests de bascule et procédures opérationnelles.

## Ordre d'achat recommandé

1. Stockage distant pour les sauvegardes.
2. Worker de build séparé, après benchmark.
3. Renforcement du nœud runtime lorsque la charge l'exige.
4. Second runtime / mécanisme de reprise lorsque le revenu et les objectifs RTO le justifient.

## Principes

- Control Plane ne doit pas être évincé par un build.
- Build Plane et Runtime Plane doivent avoir des droits et secrets séparés.
- Les sauvegardes ne doivent pas être uniquement sur le disque source.
- Les bases de la plateforme ne doivent pas être mélangées sans contrôle avec les bases clients.
- La perte d'un nœud doit avoir une procédure documentée, même avant une architecture HA.

## Fiche d'inventaire à maintenir

Pour chaque serveur : fournisseur/région, CPU, RAM, disque, réseau, OS, rôle, services, capacité réservée, charge mesurée, coût mensuel, sauvegardes, restauration testée, date du dernier test.
