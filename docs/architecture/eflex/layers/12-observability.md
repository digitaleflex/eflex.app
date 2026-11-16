# Layer 12 — Observability & Analytics

## Rôle

Détecter les problèmes techniques avant que le client les signale, puis rendre les informations compréhensibles dans le portail et les rapports.

## Capacités actuelles

**En place / partielles :**
- Logs de build et logs runtime via Coolify.
- Événements de déploiement et flux SSE.
- Métriques CPU/RAM d'application lorsque l'API Coolify et la configuration les rendent disponibles.
- Vérification TLS après déploiement.
- Santé de la plateforme E-FLEX.
- Mesure d'audience intégrée au portail, documentée dans [analytics.md](../../operations/analytics.md).

**À compléter :** surveillance continue de disponibilité de chaque site/client, incidents avec déduplication et rétablissement, métriques historiques cohérentes et rapport mensuel d'exploitation par site.

## Distinguer quatre domaines

1. **Uptime** : HTTP, DNS, TLS, temps de réponse.
2. **Infrastructure** : CPU, RAM, disque, réseau, conteneurs.
3. **Application** : health checks, erreurs, redémarrages, logs.
4. **Audience** : visites et événements agrégés.

Ne pas mélanger indisponibilité et baisse de trafic ; ce sont des signaux différents.

## Analytics déjà disponible

La mesure d'audience E-FLEX est une collecte agrégée, activée explicitement par projet, sans cookie ni identifiant visiteur persistant, sans IP/`User-Agent`/URL référente complète stockés.

**Mesuré (selon configuration du projet)** : pages vues par jour/chemin ; **visiteurs uniques quotidiens** (empreinte journalière éphémère, non réversible — le total sur une période est la somme des uniques quotidiens, sans déduplication inter-jours) ; dimensions agrégées opt-in (référent/source, appareil, navigateur, OS, pays via base GeoIP locale, paramètres UTM) avec vues et visiteurs uniques du jour par segment ; événements nommés (sans propriété) et objectifs déclaratifs ; alertes de trafic sur pages vues agrégées.

**Non mesuré** : sessions (entité distincte), durée moyenne, taux de rebond, visiteurs uniques multi-jours, attribution/propriétés d'événements, profilage. Ne pas afficher ces éléments comme mesurés.

Respecter le document [analytics](../../operations/analytics.md) pour les paramètres de confidentialité, la rétention, les exports, les alertes et les limites exactes.

## Pipeline d'incident cible

Probe ou collecteur → confirmation → déduplication → incident associé au projet → notification → ticket ou intervention → vérification de rétablissement → clôture et historique.

Éviter de créer une alerte pour chaque échec isolé de probe. Prévoir fenêtres de confirmation, cooldown et état « résolu ».

## Évolutions

- Probes HTTP externes par application.
- Contrôle DNS/TLS indépendant du déploiement.
- Seuils CPU/RAM/disque.
- Alertes de saturation et redémarrages répétés.
- Corrélation deployment ↔ incident ↔ ticket.
- Historique de disponibilité et rapport par période.

## Critères d'acceptation

- Chaque probe est horodaté et rattaché à un projet.
- Les incidents persistants ne génèrent pas une tempête de notifications.
- Un rétablissement est détecté et consigné.
- Les données sont isolées par tenant.
- Les rapports ne contiennent que des mesures réellement collectées.
