> Référentiel architectural : [Layer 12 — Observability & Analytics](../architecture/eflex/layers/12-observability.md). Cette fonctionnalité de mesure d'audience est intégrée au portail ; ce n'est pas une future intégration Umami/Plausible. Respecter les limites de collecte et de confidentialité décrites ci-dessous.

# Mesure d’audience (analytics) — confidentialité et conformité

Ce document décrit la fonctionnalité de mesure de trafic intégrée au portail (socle #109, confidentialité/conformité #112, événements/objectifs #111, cadrage et compléments #108/#113/#110, visiteurs uniques P0, dimensions P1/P2/P3). Il est factuel : il ne décrit que ce qui est effectivement implémenté et mesuré, sans données inventées.

## Finalité et périmètre

- **Finalité** : fournir au propriétaire d’un projet des statistiques de fréquentation agrégées (volume, audience et provenance) pour son site, afin d’en suivre l’usage.
- **Périmètre** : projets hébergés via EFLEX. La collecte ne concerne que les sites sur lesquels le responsable du site a explicitement intégré le snippet/point de collecte du projet.

## Données collectées (minimisation)

La mesure est conçue pour être **sans cookie, sans identifiant visiteur persistant, sans IP stockée, sans `User-Agent` ni URL référente complète stockés, et sans profilage nominatif/cross-site** :

- **Pages vues (agrégé)** : nombre de pages vues par **jour (UTC)** et, si la collecte du chemin est activée (`collectPath`), par **chemin** normalisé (sans paramètres de requête ni fragment). Si la collecte du chemin est désactivée, seul un compteur global par jour (`/`) est conservé.
- **Visiteurs uniques par jour (privacy-friendly)** : déduplication quotidienne côté serveur à l’aide d’une empreinte éphémère non réversible `HMAC-SHA256(sel_journalier, ip + '\0' + user-agent)` calculée en mémoire (IP/UA jamais persistés). Le sel est rotatif par jour UTC, ce qui empêche le recoupement entre jours. Les totaux site sont stockés par jour (`TrafficDailySiteStat` : vues et visiteurs). **Le total sur une période est la somme des uniques quotidiens, non dédupliquée entre jours** (un même visiteur sur deux jours compte deux fois sur la période). Un événement nommé ne crée pas de visiteur.
- **Dimensions agrégées (opt-in par type, activées par défaut si la collecte est active)**, calculées côté serveur sans stocker l’IP, l’UA ni l’URL référente complète. Pour chaque segment sont agrégés par jour les **vues** et les **visiteurs uniques du jour** sur ce segment (même empreinte journalière) ; un même visiteur peut apparaître dans plusieurs segments le même jour :
  - **Référents/sources** (`collectReferrer`) : domaine/origine normalisé ou `direct`. Le snippet transmet le référent de page (`r`) ; un payload sans `r` est traité comme `direct` lorsque la collecte est active.
  - **Appareil / navigateur / système d’exploitation** (`collectDevice`) : catégories bornées dérivées du `User-Agent` en mémoire (appareil `desktop`/`mobile`/`tablet`/`other`, familles navigateur et OS normalisées).
  - **Pays** (`collectCountry`) : code pays ISO (ou `Inconnu`) résolu côté serveur via une **base GeoIP locale** (`GEOIP_DB_PATH`, ex. GeoLite2 Country `.mmdb`, lecteur `maxmind`), sans appel réseau/Cloudflare. L’IP n’est utilisée qu’en mémoire pour la résolution puis écartée. Si la base est absente/indisponible, la dimension pays n’est pas enregistrée (collecte gracieuse), même si l’option est activée (`countryAvailable` exposé en configuration).
  - **Campagnes UTM** (`collectUtm`) : `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` lus par le snippet depuis l’URL de la page, transmis sous forme de valeurs bornées (`us`, `um`, `uc`, `ut`, `uo`) et normalisés côté serveur (valeurs sûres, tronquées ; paramètres vides ignorés). L’URL complète n’est pas stockée.
- **Événements nommés (#111)** : nombre d’occurrences par **jour (UTC)** et par **nom d’événement** validé (minuscules, chiffres et séparateurs sûrs `._:-`, longueur bornée). Le nom est le seul attribut accepté ; **aucune propriété libre, aucune valeur arbitraire, aucun identifiant visiteur, aucun chemin ni aucune donnée de contenu** n’est stocké pour ces événements. Les noms invalides ou refusés par quota sont ignorés silencieusement côté ingestion publique.
- **Objectifs de conversion (#111)** : liste bornée de noms d’événements marqués comme objectifs dans la configuration du projet (`goalEvents`). Marquage déclaratif, sans donnée visiteur supplémentaire.
- **Non collecté / non stocké** : adresse IP brute, identifiant de visiteur persistant, cookie, empreinte cross-jour, identifiant publicitaire, localisation fine, contenu des pages, champs de formulaire, recoupement entre sites ou entre visites, URL référente complète, `User-Agent` brut. Aucun profilage nominatif n’est réalisé.

Les en-têtes `DNT` / `Sec-GPC` peuvent être lus **uniquement** pour décider d’ignorer une mesure lorsque l’option de respect est activée ; ils ne sont pas stockés. `ProjectAnalytics.lastReceivedAt` enregistre l’horodatage de la dernière mesure effectivement comptabilisée (mise à jour limitée) afin de vérifier l’installation.

Modèles concernés : `ProjectAnalytics` (configuration, clé d’écriture, objectifs, flags de collecte, dernière réception), `TrafficDailyStat` (pages vues par chemin/jour), `TrafficDailySiteStat` (totaux site vues/visiteurs par jour), `AnalyticsDailyVisitor` (dédup visiteur/jour), `TrafficDailyDimension` et `AnalyticsDailyDimensionVisitor` (agrégats/dédup par dimension et segment : `referrer`, `device`, `browser`, `os`, `country`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`), `AnalyticsEventDaily` (événements nommés) et `AnalyticsAlert` (seuils d’alerte). Voir `portail/prisma/schema.prisma`.

## Activation, consentement et opt-out

- **Désactivée par défaut (opt-in)** : aucune collecte n’a lieu tant que la mesure n’est pas activée explicitement par un gestionnaire du projet (`enabled = false` par défaut). Un projet sans configuration active ne reçoit ni ne conserve de statistique.
- **Clé d’écriture** : la réception d’événements est authentifiée par la clé publique du projet (`publicKey`). La clé peut être régénérée (l’ancienne clé cesse d’identifier le projet).
- **Réglages de collecte** : `respectDnt`, `collectPath`, `collectReferrer`, `collectDevice`, `collectCountry`, `collectUtm` (activés par défaut) permettent d’ajuster la minimisation par type de mesure.
- **Respect DNT/GPC** : option activée par défaut (`respectDnt`). Lorsqu’elle est active, les mesures signalant Do Not Track (`DNT: 1`) ou Global Privacy Control (`Sec-GPC: 1`) sont ignorées côté serveur.
- **Consentement** : les extraits fournis n’utilisent pas de cookie et n’envoient que des mesures agrégées (page vue avec chemin, référent/UTM, ou événement nommé sans propriété). Selon la réglementation applicable et la configuration du site (exemptions de mesure d’audience, autres traceurs présents, etc.), **le responsable du site reste chargé de recueillir le consentement préalable** lorsque celui-ci est requis avant toute émission.
  - L’API de configuration expose des extraits page vue : `snippet` (émission immédiate) et `snippetConsent` (émission conditionnée). Le mode conditionné n’émet **aucune requête** tant que `window.__EFLEX_ANALYTICS_CONSENT !== true` ; après recueil du consentement, le site peut poser cette valeur à `true` puis appeler `window.__eflexTrackPageview()` (fonction exposée par le snippet) pour comptabiliser la page courante.
  - Elle expose aussi `eventSnippet`, un exemple d’envoi d’événement nommé (`window.__eflexTrackEvent(nom)`) sans propriété ni identifiant ; son usage reste soumis aux mêmes exigences d’activation, de consentement et d’opt-out.
- **Opt-out / retrait** : ne pas intégrer le snippet, désactiver la mesure (ou certains types de collecte), retirer le consentement, activer DNT/GPC côté navigateur, ou supprimer les statistiques collectées (voir ci-dessous).

## Rétention, purge, export et suppression

- **Rétention configurable et bornée** : `retentionDays` est compris entre 7 et 365 jours (90 par défaut).
- **Application effective** : les statistiques quotidiennes antérieures à la rétention sont purgées (suppression des lignes expirées) de façon opportuniste lors de la lecture de la configuration, de la consultation des statistiques et de l’export, ainsi qu’après modification de la configuration. La purge s’applique aux pages vues, totaux site, empreintes de déduplication quotidienne, dimensions agrégées et événements nommés. Les données expirées ne sont ni exposées ni conservées au-delà de la politique configurée.
- **Suppression** : `DELETE /api/projects/[id]/analytics/stats` supprime l’ensemble des statistiques agrégées du projet (pages vues, totaux/visiteurs, dimensions, événements nommés) — action gestionnaire, limitée par organisation.
- **Export** : `GET /api/projects/[id]/analytics/export` (gestionnaire) exporte les statistiques agrégées conservées, en JSON (défaut) ou CSV (`?format=csv`). L’export inclut les pages vues, totaux quotidiens site (`dailyTotals`, vues/visiteurs), événements nommés (`events`, indicateur `goal`) et toutes les dimensions agrégées (`dimensions`, dont référent, appareil, navigateur, OS, pays, UTM), ainsi que `goalEvents`. Il ne contient que des agrégats effectivement stockés (aucune propriété libre, aucun identifiant). Le CSV inclut des lignes typées (ex. `pageview`, `event`, `daily_total`, `dimension`).

> Remarque : les données étant **agrégées et non nominatives** (aucun identifiant visiteur), elles ne permettent pas, par conception, d’isoler ou d’effacer la mesure d’une personne identifiée. Les demandes d’exercice de droits portant sur d’éventuelles données personnelles relèvent du traitement global du responsable de traitement concerné.

## Accès, isolation et sécurité

- Les routes de configuration, consultation, export et suppression sont **scopées au locataire** (organisation/projet) et soumises aux contrôles de rôle existants (`requireOrg` / `requireProject`, gestionnaires pour les mutations et l’export/suppression). Aucune valeur secrète n’est exposée au-delà de la clé d’écriture de mesure, affichée uniquement aux gestionnaires du projet.
- Le point d’ingestion public `POST /api/collect` répond de manière muette (sans révéler l’existence/l’état d’une clé), applique des limites de débit et quotas, respecte DNT/GPC si activé, et n’écrit que des compteurs agrégés.

## Éléments de registre (information de traitement)

À titre indicatif pour le registre du responsable de traitement / sous-traitant, selon le rôle effectif des parties :

| Élément | Description |
| --- | --- |
| Nature des données | Compteurs agrégés de pages vues, visiteurs uniques par jour (empreinte éphémère non réversible, non stockée), répartitions par chemin, référent, appareil/navigateur/OS, pays (GeoIP locale) et paramètres UTM ; événements nommés agrégés ; aucune donnée directement identifiante, aucun cookie, aucune IP/UA/URL complète stockés. |
| Personnes concernées | Visiteurs des sites intégrant le snippet (mesure agrégée, non individualisée). |
| Finalité | Mesure d’audience agrégée du site du projet. |
| Base juridique | À déterminer par le responsable du site (ex. consentement lorsque requis, ou exemption applicable aux mesures d’audience strictement nécessaires et exemptées) ; l’outil fournit l’opt-in, le respect DNT/GPC, des réglages de minimisation et un mode conditionné au consentement. |
| Durée de conservation | Configurable par projet (7 à 365 jours, défaut 90), purge effective des agrégats expirés. |
| Destinataires | Gestionnaires autorisés du projet (au sein de l’organisation locataire). |
| Hébergement / sous-traitance | Données stockées dans la base du portail (PostgreSQL) selon l’infrastructure EFLEX ; aucun transfert à un tiers publicitaire. La résolution pays, si activée, utilise une base GeoIP locale (`GEOIP_DB_PATH`) sans appel réseau. |

## Vérification d’installation et indicateurs (#108, #109)

- `ProjectAnalytics.lastReceivedAt` est mis à jour (de façon limitée) lors de la réception d’une mesure comptabilisée. Il permet de **vérifier l’installation depuis la console** (onglet Analytique) : état « mesures reçues » avec horodatage, ou indication explicite si la collecte est activée mais qu’aucune mesure n’a encore été reçue (avec pistes : intégration/publication, consentement, DNT/GPC, bloqueurs/CSP).
- `GET /api/projects/[id]/analytics/stats` renvoie, pour la période demandée : pages vues et **visiteurs uniques par jour** (totaux et série quotidienne, `visitorsAggregation: sum_daily_unique`), chemins, comparaison avec la période précédente, événements nommés/objectifs, et répartitions agrégées — **sources/référents, pays, appareils, navigateurs, systèmes d’exploitation, UTM source/medium/campagne/terme/contenu** — lorsque collectées (vues + visiteurs uniques/jour du segment).
- **Sessions, durée moyenne, taux de rebond et visiteurs uniques multi-jours** ne sont pas mesurés (modèle sans identifiant persistant/cookie) et ne sont pas affichés. Le total visiteurs sur une période est la somme des uniques quotidiens.

## Compatibilité et dégradation gracieuse (#109)

- Le snippet envoie les mesures via `navigator.sendBeacon` (Blob JSON) avec repli `fetch` en `keepalive`/`cors` ; les erreurs d’envoi sont ignorées côté client et l’ingestion répond toujours de manière muette, sans bloquer le site.
- **Bloqueurs/publicité, DNS filtrant ou extensions** peuvent empêcher l’appel de collecte : aucune donnée n’est alors reçue (visible via l’état d’installation). **DNT/GPC** (si respect activé) ignore la mesure côté serveur.
- **CSP** : si le site applique une politique stricte, autoriser le point de collecte configuré (origine de `collectUrl`) dans `connect-src` (et, selon le mode d’intégration, la source du script inline/externe utilisé). Sans cela, l’envoi peut être bloqué par le navigateur.
- **Frameworks** : le snippet est un script JS léger compatible avec les sites statiques ou rendus côté serveur ; pour les applications monopage (SPA), déclencher `window.__eflexTrackPageview()` après chaque changement de route (ou réintégrer le snippet selon le routeur). Les helpers `__eflexTrackEvent`/`__eflexTrackPageview` sont exposés lorsque le snippet est présent.
- **Pays (GeoIP)** : nécessite `GEOIP_DB_PATH` pointant vers une base `.mmdb` lisible (ex. GeoLite2 Country). En l’absence de base ou en cas d’échec de résolution, la collecte pays est ignorée gracieusement et les autres métriques continuent.

## Alertes de trafic (#113)

- Modèle `AnalyticsAlert` (par configuration projet) : type `traffic_spike`/`traffic_drop`, `thresholdPct`, `minBaseline`, `windowDays`, `enabled`, `cooldownHours`, `lastTriggeredAt`/`lastEvaluatedAt`. Seuils bornés côté API.
- API de configuration : `GET/PUT /api/projects/[id]/analytics/alerts` (gestionnaire, scopée locataire/projet, limitée en débit, auditée `project.analytics.alerts.update`). Interface de configuration disponible dans la console (onglet Analytique du projet, gestionnaires).
- Évaluation planifiée dans le worker (`startAnalyticsAlertsMaintenance`, toutes les heures) : compare la fenêtre courante à la précédente sur les **agrégats réels** de pages vues (`TrafficDailyStat`), respecte le plancher et le délai de refroidissement, puis notifie les propriétaires/administrateurs de l’organisation via `lib/notifications.ts` (`analytics.traffic_spike` / `analytics.traffic_drop`, `dedupeKey` stable, lien projet). Aucune évaluation sur le chemin d’ingestion, aucun profilage nominatif.

## Limites connues et suite

- **Audit** : opérations sensibles auditées (`project.analytics.export`, `project.analytics.stats.delete`, `project.analytics.config.update`, `project.analytics.alerts.update`) ; export/suppression/alertes limités en débit et scopés locataire/projet.
- **Événements/objectifs (#111)** : événements nommés agrégés sans propriété ni identifiant, objectifs déclaratifs gérés dans l’UI et marqués dans les statistiques/export. Aucune propriété d’événement collectée. Limites : validation/normalisation des noms, liste d’objectifs bornée, plafond de noms d’événements distincts par projet (`ANALYTICS_DISTINCT_EVENT_NAMES_MAX`) et quotas d’ingestion (débit + journalier).
- **Métriques non mesurées** (modèle sans identifiant persistant/cookie) : sessions comme entité distincte, durée moyenne, taux de rebond, visiteurs uniques multi-jours (le total période = somme des uniques quotidiens). Elles ne sont pas affichées.
- **Alertes** : pics/chutes de pages vues agrégées, configurables. À cadrer ultérieurement : corrélation avec l’indisponibilité et alertes sur événements nommés.
- **Hors scope** : entonnoirs/conversions calculées avancées, propriétés d’événements, segmentation avancée, attribution, corrélation inter-visites/sites, profilage nominatif, SDK/package dédié (le snippet + helpers constituent l’intégration de référence).
- **Volume/abus** : limites de débit IP et par clé (minute) + quota journalier par clé/projet sur l’ingestion, et plafond de noms d’événements distincts. La purge opportuniste applique la rétention.
- Pas de bannière de consentement fournie côté site visité : le recueil et la preuve du consentement relèvent du responsable du site (snippet conditionné fourni).
- Les garanties de conformité (ex. qualification d’exemption CNIL/RGPD, DPA, mentions légales finales) doivent être validées par le responsable de traitement et, le cas échéant, un conseil juridique ; ce document ne constitue pas un avis juridique.
