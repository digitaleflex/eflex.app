# Réseau Docker par organisation (audit S5, issue #171)

> **État : code livré, désactivé par défaut (`EFLEX_ORG_NETWORKS`), non validé sur un vrai serveur.**

## Principe
Chaque organisation reçoit un réseau Docker dédié (une « destination » Coolify, `eflex-net-<id>`), créé à la demande par
`POST /servers/{uuid}/destinations` (contrat vérifié dans l'OpenAPI de Coolify 4.7.5). Les nouvelles applications (dépôt, image Docker),
bases managées et services de l'organisation sont créés avec `destination_uuid`. Ainsi une application ne joint plus le conteneur d'un autre client par son nom.

## Activation
```bash
EFLEX_ORG_NETWORKS=1   # dans .env.prod, puis redémarrer portail et worker
```
Appliquer la migration `20261123120000_org_network_destination` (colonne `Organization.coolifyDestinationUuid`).

## Comportement
- **Désactivé** (défaut) : rien ne change, tout reste sur le réseau partagé.
- **Activé** : échec **fermé**. Si le réseau de l'organisation ne peut pas être préparé, la création échoue avec un message ; rien n'est créé dans le réseau partagé.
- Idempotent et tolérant aux courses : un conflit (409/422) reprend le réseau existant du même nom.

## À valider sur le serveur AVANT d'activer en production
1. **Routage** : le proxy Traefik doit être attaché à chaque réseau d'organisation pour router ses applications (critère d'acceptation de #171). Coolify gère-t-il cela seul pour une destination créée par l'API, ou faut-il redémarrer le proxy ? À tester sur une organisation de test.
2. **Isolation réelle** : depuis une application de l'organisation A, `getent hosts <conteneur de B>` ne doit rien résoudre.
3. **Bases managées** : les chaînes de connexion internes restent valides dans le réseau dédié ; l'application et sa base doivent appartenir à la **même** organisation (c'est le cas).
4. **Services Coolify** et l'**outil de supervision** (Dozzle/Beszel/Uptime Kuma), installés hors organisation, restent sur le réseau partagé.

## Ce qui n'est PAS fait
- **Migration des ressources existantes** vers les réseaux d'organisation (`/applications/{uuid}/migrate`, `/databases/{uuid}/migrate`, `/services/{uuid}/migrate` existent) : à faire projet par projet, après validation de ce qui précède. Tant que ce n'est pas fait, les ressources déjà créées restent sur le réseau partagé.
- Les prévisualisations de pull requests utilisent l'application existante (donc son réseau).
