> Référentiel architectural : [Layer 12 — Observability & Analytics](../architecture/eflex/layers/12-observability.md). Cette fonctionnalité de mesure d'audience est déjà intégrée au portail ; ce n'est pas une future intégration Umami/Plausible. Respecter les limites de collecte et de confidentialité décrites ci-dessous.

# Mesure d’audience (analytics) — confidentialité et conformité

Ce document décrit la fonctionnalité de mesure de trafic intégrée au portail (socle #109, confidentialité/conformité #112, événements/objectifs #111, cadrage et compléments #108/#113/#110). Il est factuel : il ne décrit que ce qui est effectivement implémenté et mesuré, sans données inventées.

## Finalité et périmètre

- **Finalité** : fournir au propriétaire d’un projet des statistiques de fréquentation agrégées (volume de pages vues) pour son site, afin d’en suivre l’usage.
- **Périmètre** : projets hébergés via EFLEX. La collecte ne concerne que les sites sur lesquels le responsable du site a explicitement intégré le snippet/point de collecte du projet.

## Données collectées (minimisation)

La mesure est conçue pour être **sans cookie, sans identifiant visiteur persistant, sans IP stockée et sans profilage nominatif/cross-site** :

- **Pages vues (agrégé)** : nombre de pages vues par **jour (UTC)** et, si la collecte du chemin est activée (`collectPath`), par **chemin** normalisé (sans paramètres de requête ni fragment). Si la collecte du chemin est désactivée, seul un compteur global par jour (`/`) est conservé.
- **Visiteurs uniques par jour (privacy-friendly)** : déduplication quotidienne côté serveur à l’aide d’une empreinte éphémère non réversible `HMAC-SHA256(sel_journalier, ip + '\0' + user-agent)` calculée en mémoire (IP/UA jamais persistés). Le sel est rotatif par jour UTC, ce qui empêche le recoupement entre jours. Les totaux site sont stockés par jour (`TrafficDailySiteStat` : vues et visiteurs). **Le total sur une période est la somme des uniques quotidiens, non dédupliquée entre jours** (un même visiteur sur deux jours compte deux fois sur la période). Un événement nommé ne crée pas de visiteur.
- **Dimensions agrégées (opt-in par type, activées par défaut)**, calculées côté serveur sans stocker l’UA ni l’URL référente complète :
  - **Référents/sources** (`collectReferrer`) : domaine/origine normalisé ou `direct` (jamais l’URL complète). Le snippet transmet le référent de page (`r`) ; un payload sans `r` est traité comme `direct` lorsque la collecte est active.
  - **Appareil / navigateur / système d’exploitation** (`collectDevice`) : catégories bornées dérivées du `User-Agent` en mémoire (ex. `desktop`/`mobile`/`tablet`/`other`, familles navigateur/OS normalisées).
  Pour chaque segment, sont agrégés par jour les **vues** et les **visiteurs uniques du jour** sur ce segment (même empreinte journalière), sans IP/UA/référent brut stockés.
- **Événements nommés (#111, incrément minimal)** : nombre d’occurrences par **jour (UTC)** et par **nom d’événement** validé (minuscules, chiffres et séparateurs sûrs `._:-`, longueur bornée). Le nom est le seul attribut accepté ; **aucune propriété libre, aucune valeur arbitraire, aucun identifiant visiteur, aucun chemin ni aucune donnée de contenu** n’est stocké pour ces événements. Les noms invalides ou refusés par quota sont ignorés silencieusement côté ingestion publique.
- **Objectifs de conversion (#111, configuration)** : une liste bornée de noms d’événements marqués comme objectifs dans la configuration du projet (`goalEvents`). Il s’agit d’un marquage déclaratif côté configuration (aucune donnée visiteur supplémentaire).
- **Non collecté / non stocké** : adresse IP brute, identifiant de visiteur persistant, cookie, empreinte cross-jour, identifiant publicitaire, données de localisation/géographie (fine ou dérivée de l’IP), contenu des pages, champs de formulaire, recoupement entre sites ou entre visites, **paramètres UTM/campagnes détaillés**, URL référente complète, `User-Agent` brut. Aucun profilage nominatif n’est réalisé.

Les en-têtes `DNT` / `Sec-GPC` peuvent être lus **uniquement** pour décider d’ignorer une mesure lorsque l’option de respect est activée ; ils ne sont pas stockés. `ProjectAnalytics.lastReceivedAt` enregistre l’horodatage de la dernière mesure effectivement comptabilisée (mise à jour limitée pour ne pas charger l’ingestion) afin de vérifier l’installation.

Modèles concernés : `ProjectAnalytics` (configuration, clé d’écriture, objectifs, flags de collecte, dernière réception), `TrafficDailyStat` (pages vues par chemin/jour), `TrafficDailySiteStat` (totaux site vues/visiteurs par jour), `AnalyticsDailyVisitor` (dédup visiteur/jour), `TrafficDailyDimension` et `AnalyticsDailyDimensionVisitor` (agrégats/dédup par dimension et segment), `AnalyticsEventDaily` (événements nommés) et `AnalyticsAlert` (seuils d’alerte). Voir `portail/prisma/schema.prisma`.

## Activation, consentement et opt-out

- **Désactivée par défaut (opt-in)** : aucune collecte n’a lieu tant que la mesure n’est pas activée explicitement par un gestionnaire du projet (`enabled = false` par défaut). Un projet sans configuration active ne reçoit ni ne conserve de statistique.
- **Clé d’écriture** : la réception d’événements est authentifiée par la clé publique du projet (`publicKey`). La clé peut être régénérée (l’ancienne clé cesse d’identifier le projet).
- **Respect DNT/GPC** : option activée par défaut (`respectDnt`). Lorsqu’elle est active, les mesures signalant Do Not Track (`DNT: 1`) ou Global Privacy Control (`Sec-GPC: 1`) sont ignorées côté serveur.
- **Consentement** : les extraits fournis n’utilisent pas de cookie et n’envoient que des mesures agrégées (page vue avec chemin, ou événement nommé sans propriété). Selon la réglementation applicable et la configuration du site (exemptions de mesure d’audience, autres traceurs présents, etc.), **le responsable du site reste chargé de recueillir le consentement préalable** lorsque celui-ci est requis avant toute émission.
  - L’API de configuration expose des extraits page vue : `snippet` (émission immédiate) et `snippetConsent` (émission conditionnée). Le mode conditionné n’émet **aucune requête** tant que `window.__EFLEX_ANALYTICS_CONSENT !== true` ; après recueil du consentement, le site peut poser cette valeur à `true` puis appeler `window.__eflexTrackPageview()` (fonction exposée par le snippet) pour comptabiliser la page courante.
  - Elle expose aussi `eventSnippet`, un exemple d’envoi d’événement nommé (`window.__eflexTrackEvent(nom)`) sans propriété ni identifiant ; son usage reste soumis aux mêmes exigences d’activation, de consentement et d’opt-out.
- **Opt-out / retrait** : ne pas intégrer le snippet, désactiver la mesure, retirer le consentement (ne pas positionner `__EFLEX_ANALYTICS_CONSENT` / ne pas appeler le snippet), activer DNT/GPC côté navigateur, ou supprimer les statistiques collectées (voir ci-dessous).

## Rétention, purge, export et suppression

- **Rétention configurable et bornée** : `retentionDays` est compris entre 7 et 365 jours (90 par défaut).
- **Application effective** : les statistiques quotidiennes antérieures à la rétention sont purgées (suppression des lignes expirées) de façon opportuniste lors de la lecture de la configuration, de la consultation des statistiques et de l’export, ainsi qu’après modification de la configuration. La purge s’applique aux pages vues et aux événements nommés agrégés. Les données expirées ne sont ni exposées ni conservées au-delà de la politique configurée.
- **Suppression** : `DELETE /api/projects/[id]/analytics/stats` supprime l’ensemble des statistiques agrégées du projet, pages vues et événements nommés (action gestionnaire, limitée par organisation).
- **Export** : `GET /api/projects/[id]/analytics/export` (gestionnaire) exporte les statistiques agrégées conservées, en JSON (défaut) ou CSV (`?format=csv`). L’export inclut les pages vues (`rows`) et les événements nommés agrégés (`events`, avec l’indicateur `goal` dérivé de la configuration), ainsi que `goalEvents`. Il ne contient que des agrégats effectivement stockés (aucune propriété, aucun identifiant). Le CSV fusionne les deux séries avec une colonne `type` (`pageview` / `event`).

> Remarque : les données étant **agrégées et non nominatives** (aucun identifiant visiteur), elles ne permettent pas, par conception, d’isoler ou d’effacer la mesure d’une personne identifiée. Les demandes d’exercice de droits portant sur d’éventuelles données personnelles relèvent du traitement global du responsable de traitement concerné.

## Accès, isolation et sécurité

- Les routes de configuration, consultation, export et suppression sont **scopées au locataire** (organisation/projet) et soumises aux contrôles de rôle existants (`requireOrg` / `requireProject`, gestionnaires pour les mutations et l’export/suppression). Aucune valeur secrète n’est exposée au-delà de la clé d’écriture de mesure, affichée uniquement aux gestionnaires du projet.
- Le point d’ingestion public `POST /api/collect` répond de manière muette (sans révéler l’existence/l’état d’une clé), applique des limites de débit, respecte DNT/GPC si activé, et n’écrit qu’un compteur agrégé.

## Éléments de registre (information de traitement)

À titre indicatif pour le registre du responsable de traitement / sous-traitant, selon le rôle effectif des parties :

| Élément | Description |
| --- | --- |
| Nature des données | Compteurs agrégés de pages vues par jour et chemin ; aucune donnée directement identifiante, aucun cookie. |
| Personnes concernées | Visiteurs des sites intégrant le snippet (mesure globale, non individualisée). |
| Finalité | Mesure d’audience agrégée du site du projet. |
| Base juridique | À déterminer par le responsable du site (ex. consentement lorsque requis, ou exemption applicable aux mesures d’audience strictement nécessaires et exemptées) ; l’outil fournit l’opt-in, le respect DNT/GPC et un mode conditionné au consentement. |
| Durée de conservation | Configurable par projet (7 à 365 jours, défaut 90), purge effective des agrégats expirés. |
| Destinataires | Gestionnaires autorisés du projet (au sein de l’organisation locataire). |
| Hébergement / sous-traitance | Données stockées dans la base du portail (PostgreSQL) selon l’infrastructure EFLEX ; aucun transfert à un tiers publicitaire. |

## Vérification d’installation et indicateurs (#108, #109)

- `ProjectAnalytics.lastReceivedAt` est mis à jour (de façon limitée) lors de la réception d’une mesure comptabilisée. Il permet de **vérifier l’installation depuis la console** (onglet Analytique) : état « mesures reçues » avec horodatage, ou indication explicite si la collecte est activée mais qu’aucune mesure n’a encore été reçue (avec pistes : intégration/publication, consentement, DNT/GPC, bloqueurs/CSP).
- `GET /api/projects/[id]/analytics/stats` renvoie, pour la période demandée : pages vues et visiteurs uniques/jour (totaux et série quotidienne), chemins, événements nommés/objectifs, dimensions agrégées (référents, appareils, navigateurs, OS) quand collectées, ainsi qu’une **comparaison** avec la période précédente de même durée (totaux, jours actifs, variation relative vues/visiteurs) et des informations d’installation. Les indicateurs dérivés des agrégats sont affichés avec leur période/source.
- **Sessions, durée moyenne, taux de rebond et visiteurs uniques multi-jours** ne sont pas mesurés (modèle sans identifiant persistant/cookie) et ne sont pas affichés. **Paramètres UTM/campagnes détaillés et géographie** ne sont pas collectés.

## Compatibilité et dégradation gracieuse (#109)

- Le snippet envoie les mesures via `navigator.sendBeacon` (Blob JSON) avec repli `fetch` en `keepalive`/`cors` ; les erreurs d’envoi sont ignorées côté client et l’ingestion répond toujours de manière muette, sans bloquer le site.
- **Bloqueurs/publicité, DNS filtrant ou extensions** peuvent empêcher l’appel de collecte : aucune donnée n’est alors reçue (visible via l’état d’installation). **DNT/GPC** (si respect activé) ignore la mesure côté serveur.
- **CSP** : si le site applique une politique stricte, autoriser le point de collecte configuré (origine de `collectUrl`) dans `connect-src` (et, selon le mode d’intégration, la source du script inline/externe utilisé). Sans cela, l’envoi peut être bloqué par le navigateur.
- **Frameworks** : le snippet est un script JS léger compatible avec les sites statiques ou rendus côté serveur ; pour les applications monopage (SPA), déclencher `window.__eflexTrackPageview()` après chaque changement de route (ou réintégrer le snippet selon le routeur). Les helpers `__eflexTrackEvent`/`__eflexTrackPageview` sont exposés lorsque le snippet est présent.

## Alertes de trafic (#113)

- Modèle `AnalyticsAlert` (par configuration projet) : type `traffic_spike`/`traffic_drop`, `thresholdPct`, `minBaseline`, `windowDays`, `enabled`, `cooldownHours`, `lastTriggeredAt`/`lastEvaluatedAt`. Seuils bornés côté API.
- API de configuration : `GET/PUT /api/projects/[id]/analytics/alerts` (gestionnaire, scopée locataire/projet, limitée en débit, auditée `project.analytics.alerts.update`). **Interface de configuration** disponible dans la console (onglet Analytique du projet, gestionnaires).
- Évaluation planifiée dans le worker (`startAnalyticsAlertsMaintenance`, toutes les heures) : compare la fenêtre courante à la précédente sur les **agrégats réels** de pages vues (`TrafficDailyStat`), respecte le plancher et le délai de refroidissement, puis notifie les propriétaires/administrateurs de l’organisation via `lib/notifications.ts` (`analytics.traffic_spike` / `analytics.traffic_drop`, `dedupeKey` stable, lien projet). Aucune évaluation sur le chemin d’ingestion, aucun profilage nominatif. L’interface de configuration peut être enrichie ; la corrélation avec l’indisponibilité et les alertes sur événements nommés restent à cadrer sur données réelles.

## Limites connues et suite (#110, #111, #112, #113)

- **Audit (#113)** : opérations sensibles auditées (`project.analytics.export`, `project.analytics.stats.delete`, `project.analytics.config.update`, `project.analytics.alerts.update`) ; export/suppression/alertes limités en débit et scopés locataire/projet avec contrôles de rôle gestionnaire.
- **Événements/objectifs (#111)** : événements nommés agrégés sans propriété ni identifiant, objectifs déclaratifs gérés dans l’UI et marqués dans les statistiques/export. **Décision de minimisation** : aucune propriété d’événement n’est collectée. Limites explicites : validation/normalisation des noms, liste d’objectifs bornée, **plafond de noms d’événements distincts stockés par projet** (`ANALYTICS_DISTINCT_EVENT_NAMES_MAX`) et quotas d’ingestion (débit + journalier) ; un nom nouveau au-delà du plafond est ignoré.
- **Référents, appareils/navigateurs/OS (#110, partiel)** : collectés de façon agrégée et opt-in par type (domaine/source, catégories appareil/navigateur/OS), sans URL référente complète ni `User-Agent` brut. **Non collectés** : paramètres UTM/campagnes détaillés et géographie (pays/régions), qui nécessiteraient un cadrage produit/confidentialité supplémentaire (activation explicite, minimisation, seuils anti-ré-identification, absence d’IP brute/profilage).
- **Métriques non mesurées** (modèle sans identifiant persistant/cookie) : sessions comme entité distincte, durée moyenne, taux de rebond, visiteurs uniques multi-jours (le total période = somme des uniques quotidiens). Elles ne sont pas affichées.
- **Alertes** : pics/chutes de pages vues agrégées, configurables (seuils/fenêtre/plancher/refroidissement) via API et console. À cadrer ultérieurement : corrélation avec l’indisponibilité et alertes sur événements nommés.
- **Hors scope** : entonnoirs/conversions calculées avancées, propriétés d’événements, segmentation, attribution, corrélation inter-visites/sites, profilage nominatif, SDK/package dédié (le snippet + helpers constituent l’intégration de référence).
- **Volume/abus** : limites de débit IP et par clé (minute) + **quota journalier par clé/projet** sur l’ingestion, et plafond de noms d’événements distincts. La purge opportuniste applique la rétention ; un job planifié global peut compléter pour les projets rarement consultés.
- Pas de bannière de consentement fournie côté site visité : le recueil et la preuve du consentement relèvent du responsable du site (snippet conditionné fourni).
- Les garanties de conformité (ex. qualification d’exemption CNIL/RGPD, DPA, mentions légales finales) doivent être validées par le responsable de traitement et, le cas échéant, un conseil juridique ; ce document ne constitue pas un avis juridique.
