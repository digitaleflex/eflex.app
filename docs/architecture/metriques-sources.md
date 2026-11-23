# Sources de mesure : ce qui existe, ce qui manque (issues #119 à #122)

> Rédigé le 2026-11-23. Principe de produit : **aucune valeur sans source** (l'interface affiche « non disponible » sinon).

## État des sources

| Mesure | Source réelle aujourd'hui | Verdict |
|---|---|---|
| CPU / mémoire d'une application (instantané) | `GET /applications/{uuid}/metrics` — **absente** de l'API Coolify 4.7.5 (voir `coolify-api-capacites.md`) ; affichage « indisponible » | Pas de source |
| Stockage (images, volumes, bases) | Aucune route Coolify ; il faudrait `docker system df` / les statistiques d'un agent sur l'hôte | Pas de source |
| Bande passante (octets entrants/sortants) | Aucune. `TrafficDailyStat` compte des **visites** (`POST /api/collect`), pas des octets | Pas de source — ne pas confondre |
| Séries temporelles | Rien n'est échantillonné ni stocké côté portail | À construire **après** une source |
| Alertes de ressources | Dépendent des mesures ci-dessus | Bloqué |

## Décision (prise pour avancer, révisable)

**Source cible : Beszel** (déjà installable depuis l'administration, onglet Supervision, `lib/ops-tools.ts`). Son agent lit le moteur de conteneurs et fournit CPU, mémoire, disque et réseau **par conteneur**, avec historique. Pourquoi lui plutôt que d'écrire un collecteur :
- l'agent existe déjà dans notre catalogue d'outils, avec accès en lecture seule au socket Docker ;
- il évite de réimplémenter un échantillonneur, une rétention et des graphiques ;
- cAdvisor ou un `docker stats` périodique par un worker sont les solutions de repli (plus de code à maintenir, aucun historique natif).

## Plan d'implémentation (non fait ici, car impossible à valider sans serveur)

1. **Lecture** : client côté serveur de l'API du hub Beszel (jeton lecture seule stocké comme secret de l'installation), correspondance conteneur → application par le nom/étiquette Coolify (`detectCatalogId`-like, strict : jamais de préfixe).
2. **#119 stockage / #120 réseau** : affichés par application avec unité, instant et source = « Beszel » ; « non disponible » si l'agent ne répond pas. Les octets réseau viennent des compteurs du conteneur, pas de l'analytique de visites.
3. **#121 séries** : relais de l'historique du hub (rétention du hub, documentée) plutôt qu'une nouvelle table ; si une table propre est préférée, échantillonner par un job BullMQ toutes les 5 min avec rétention de 30 jours.
4. **#122 alertes** : règles à seuils configurables par projet (CPU, mémoire, stockage, redémarrages), déduplication par fenêtre (modèle de `evaluateDatabaseBackups`), canaux de notification existants, lien vers le diagnostic.
5. **Isolation** : toute route classée dans le manifeste d'isolation ; un client ne voit que ses conteneurs.

## Ce qu'il faut valider sur un vrai serveur avant de coder
- Forme exacte des réponses de l'API Beszel de la version installée.
- Étiquettes de conteneurs posées par Coolify (pour la correspondance stricte).
- Coût de l'échantillonnage sur un petit serveur.
