# Maintenance automatique des abonnements

> Relance de #18. Module : `portail/src/lib/billing-renewal.ts`.
> Démarrage : `portail/src/worker.ts` (worker BullMQ, lui-même lancé par
> `portail/src/instrumentation.ts` quand `REDIS_URL` est présent).

La plateforme **n'encaisse aucun paiement récurrent**. Cette maintenance ne
facture jamais, n'appelle ni Kkiapay ni FedaPay et ne supprime aucune donnée :
elle constate les échéances, ouvre/ferme la période de grâce et expire les
paiements abandonnés.

## Unité de quota (D2)

Depuis le lot D2, le quota « projets » des plans (`limits.projects` /
`Subscription.projectLimitOverride`, exposé comme `projectLimit` dans les plans
et l'API admin) est compté en **applications déployables** et non en projets.

- **Consommation quota** (`usage.apps` dans `billingSummary`) : nombre de lignes
  `ProjectApp` de l’organisation **+** nombre de projets historiques sans aucune
  `ProjectApp` (une application implicite par projet, même formule que
  `assertProjectQuota`).
- **Projets réels** (`usage.projects` dans `billingSummary`, conservé pour
  compatibilité) : `Project.count` de l’organisation.
- **Limite** : `limits.projects` (issue du plan effectif ou d’une dérogation
  `projectLimitOverride`) exprime le **nombre maximal d’applications** autorisées.
  Le nom du champ est conservé pour compatibilité de schéma/API.
- Les créations refusées au quota, les barres de consommation et les alertes
  admin se basent sur `usage.apps` face à `limits.projects`.

## 1. Règles appliquées

| Situation constatée | Action | Statut après | Limites / accès |
| --- | --- | --- | --- |
| `active` ou `trialing` avec `currentPeriodEnd` dans le futur | aucune | inchangé | plan souscrit |
| `active` ou `trialing` avec `currentPeriodEnd` dépassé | ouverture de la grâce | `past_due` + `graceUntil` | plan souscrit conservé pendant la grâce |
| `active`/`trialing` sans `currentPeriodEnd` | aucune | inchangé | plan souscrit (on ne coupe pas sur une supposition) |
| `past_due` avec `graceUntil` dans le futur | rappel garanti (idempotent) | inchangé | plan souscrit conservé |
| `past_due` avec `graceUntil` dépassé (ou absent) | dernier rappel | **reste `past_due`** | créations et nouveaux déploiements bloqués, applications et données intactes |
| `manualOverride = true` | **aucune action** | inchangé | plan accordé par un administrateur |
| `cancelled`, `pending`, `free` | aucune | inchangé | — |
| paiement `pending` créé il y a plus de 24 h | expiration | `expired` | aucun impact sur l'abonnement |

### Calcul de la grâce

`graceDeadline(currentPeriodEnd, now)` (`portail/src/lib/billing.ts`), déjà
utilisée par `markPaymentFailed` :

- échéance future : `currentPeriodEnd + 7 jours` ;
- échéance déjà dépassée : `now + 7 jours` (le cron peut avoir été arrêté, on
  ne coupe pas immédiatement un client dont l'échéance date de plusieurs
  semaines).

`GRACE_PERIOD_DAYS` vaut 7 (`portail/src/lib/plans.ts`).

### Pourquoi rester en `past_due` après la grâce ?

`portail/src/lib/billing.ts` traite `past_due` sans grâce active comme
**bloquant** (`blockCode = payment_past_due`) tout en laissant les applications
existantes en ligne. Un passage en `cancelled` retomberait sur le plan gratuit
et **lèverait** ce blocage, ce qui n'est pas le comportement voulu après un
impayé. Le statut brut reste donc `past_due` ; la phase dérivée affichée par
`loadBillingState` reste elle aussi `past_due`, et la date de fin de grâce est
conservée pour l'audit et l'interface.

Aucun projet, déploiement, domaine, base managée ou variable n'est modifié ou
supprimé par cette maintenance. La réactivation se fait par un paiement
(`activatePayment`) ou une action d'administration auditée.

### Plans accordés manuellement

`manualOverride` protège un geste commercial : ni le cron, ni un paiement pour
un autre plan ne l'écrasent. La maintenance ignore complètement ces
abonnements, même si l'échéance est ancienne. Un administrateur peut les faire
évoluer depuis `/admin/organizations`.

## 2. Fréquence et exécution

- Passe **au démarrage du worker** (rattrapage après redémarrage), puis toutes
  les **6 heures** (`BILLING_MAINTENANCE_INTERVAL_MS`), via
  `setInterval(...).unref()` : le minuteur ne retient pas le processus.
- Le worker ne démarre que si `REDIS_URL` est défini. Sans Redis, la
  maintenance ne tourne pas ; les gardes de `lib/billing.ts` restent appliquées
  à la lecture, mais aucune échéance n'est constatée automatiquement.
- Log en cas d'activité :
  `[eflex/billing] maintenance : N grâce(s) ouverte(s), N fin(s) de grâce, N notification(s), N paiement(s) expiré(s).`
- Erreurs : `[eflex/billing] maintenance automatique impossible : …` (une
  erreur sur un abonnement n'empêche pas de traiter les suivants).

## 3. Idempotence et concurrence

- **Mise à jour conditionnelle** : `updateMany` ne passe en `past_due` que si
  l'abonnement a encore le statut, l'échéance et `manualOverride = false`
  observés. Un paiement ou une action d'administration concurrent gagne et la
  notification de relance n'est pas envoyée.
- **Notifications** : `dedupeKey` stable par abonnement et période
  (`billing:grace-start:<subscriptionId>:<échéance ISO>`,
  `billing:grace-end:<subscriptionId>:<fin de grâce ISO>`) sur la contrainte
  unique `(userId, dedupeKey)`. Rejouer la passe ne crée ni doublon in-app ni
  second e-mail. La clé de début de grâce est aussi utilisée pendant la grâce,
  ce qui permet de rattraper un envoi manqué.
- **Verrou par processus** : une seule exécution à la fois dans un processus
  (`maintenanceRunning`). Deux appels simultanés : le second est ignoré
  (`skipped: true`).
- **Limite multi-instances** : chaque instance du portail a son propre worker et
  son propre minuteur ; il n'y a pas de verrou distribué. Les écritures
  conditionnelles et les `dedupeKey` empêchent les doubles transitions et les
  doublons, mais chaque instance interroge la base toutes les 6 h. Pour un
  déploiement multi-instances à fort volume, remplacer le minuteur par un
  **job répétable BullMQ** (un seul leader, même file Redis) ou une tâche
  planifiée externe appelant la passe. À faire avant de scaler le portail
  horizontalement.

## 4. Destinataires et contenu

- Destinataires : membres avec le rôle **owner**, **admin** ou **billing**
  (`memberIds(organizationId, ['owner', 'admin', 'billing'])`).
- Canaux : notification in-app + e-mail si `RESEND_API_KEY` est configurée et
  que le type n'est pas désactivé dans les préférences.
- Types (`portail/src/lib/notifications.ts`) :
  - `billing.grace_started` — « Abonnement … : paiement en retard » ;
  - `billing.grace_ended` — « Abonnement … : période de grâce terminée ».
- Lien : `/dashboard/organization` (Équipe → Abonnement).
- Aucun montant, secret, jeton ou valeur de variable n'est inclus.

## 5. Exploitation

### Résumé de facturation (`billingSummary`)

`billingSummary(organizationId)` (`portail/src/lib/billing.ts`) expose notamment :

- `plan`, `subscribedPlan`, `phase`, `status`, dates et blocages ;
- `limits.projects` : quota maximal d’**applications** (unité D2 ; le nom du champ
  reste `projects` pour compatibilité) ;
- `usage.projects` : nombre réel de projets (compatibilité) ;
- `usage.apps` : consommation du quota d’applications (`ProjectApp` + projets
  implicites sans app) ;
- `usage.members` : membres de l’organisation.

### Vérifier les abonnements concernés

```sql
-- échéances dépassées encore actives
SELECT id, "organizationId", status, plan, "currentPeriodEnd", "graceUntil", "manualOverride"
FROM "Subscription"
WHERE status IN ('active', 'trialing')
  AND "currentPeriodEnd" < now()
  AND "manualOverride" = false;

-- fins de grâce atteintes
SELECT id, "organizationId", status, plan, "graceUntil"
FROM "Subscription"
WHERE status = 'past_due' AND ("graceUntil" IS NULL OR "graceUntil" < now());
```

### Vérifier les notifications

```sql
SELECT "userId", type, "dedupeKey", "createdAt"
FROM "Notification"
WHERE type LIKE 'billing.%'
ORDER BY "createdAt" DESC
LIMIT 50;
```

### Régularisation manuelle d'un client

1. Paiement réel depuis `/dashboard/organization` (Kkiapay/FedaPay) : la
   libération de la grâce et l'allongement de 30 jours sont automatiques.
2. Ou action admin auditée (`POST /api/admin/organizations/[id]/subscription`)
   pour prolonger, changer de plan ou accorder un `manualOverride`.
3. Ne jamais supprimer la ligne `Subscription` pour « réparer » : préférer une
   action admin, qui trace le motif.

## 6. Rollback

La maintenance est une fonction appelée par le worker : aucun schéma ni
migration n'a été ajouté. Pour l'arrêter :

1. Déployer l'image précédente (le minuteur disparaît avec le code), ou
   commenter l'appel `startBillingMaintenance()` dans `portail/src/worker.ts`
   lors d'un correctif d'urgence.
2. Les effets déjà appliqués sont réversibles par action admin auditée : passer
   l'abonnement en `active` et effacer `graceUntil`, ou prolonger
   `currentPeriodEnd`. Un paiement `expired` peut être recréé par un nouveau
   checkout ; aucun paiement n'a été supprimé.

Aucun e-mail n'est renvoyé après un rollback : les `dedupeKey` déjà créées
restent en base.

## 7. Tests

- Unitaires : `portail/src/lib/billing-renewal.test.ts` (échéance dépassée,
  grâce, fin de grâce, override manuel, idempotence, paiements `pending`,
  concurrence, absence de suppression).
- Intégration (optionnelle) : même fichier, avec `EFLEX_TEST_DB=1` et une base
  migrée. Le garde-fou de `test-support/test-database.ts` refuse toute base dont
  le nom ne contient pas « test ».

```bash
# unitaires seuls (sans base)
pnpm vitest run portail/src/lib/billing-renewal.test.ts

# intégration sur une base jetable
EFLEX_TEST_DB=1 DATABASE_URL=postgres://…/eflex_test \
BETTER_AUTH_SECRET=… ENV_ENCRYPTION_KEY=… \
pnpm vitest run portail/src/lib/billing-renewal.test.ts
```
