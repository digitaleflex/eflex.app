# Plan d'essais sur serveur — ce qu'il faut prouver

> **Pourquoi.** [Le point du 26/11](../architecture/point-fonctionnalites-2026-11-26.md) liste six
> choses qui n'ont jamais été constatées sur un serveur. Ce plan donne, pour chacune, les étapes, le résultat
> attendu et la preuve à consigner.
>
> **Règle.** Tout essai qui peut perturber un service (redémarrage, coupure, restauration) se fait sur le
> **staging** (`docker-compose.staging.yml`, voir [staging.md](staging.md)), jamais en production. Les seuls
> essais en production sont en lecture seule ou non destructifs (§2 sauf mention).
>
> **Honnêteté.** Les résultats attendus décrivent le comportement voulu d'après le code. Si le résultat
> observé diffère, c'est la **découverte** que l'essai cherchait : consignez-la telle quelle, ne l'ajustez pas.
> Les commandes citées existent dans le dépôt ; pour leurs options exactes, lisez l'en-tête de chaque script
> (je n'ai pas pu les exécuter sur vos serveurs).

## Fiche de résultat (à copier pour chaque essai)

```
Essai : E1 … E6          Date :            Version déployée (SHA) :
Environnement : staging / production (lecture seule)
Résultat : conforme / écart / échec
Observé :
Preuve (journal, capture, sortie de commande) :
Issue ouverte si écart :
```

## E1 — Déploiement de bout en bout (dépôt → site en HTTPS)

| | |
|---|---|
| **But** | Confirmer que le chemin complet fonctionne : GitHub → file → worker → Coolify → site en ligne avec certificat. |
| **Préalables** | Staging déployé (`bash deploy-staging.sh`, voir son en-tête), jeton Coolify du staging, un dépôt de test **public** et minimal (Next.js ou statique), un sous-domaine de test pointant vers le serveur. |
| **Étapes** | 1. Dans le portail de staging, importer le dépôt. 2. Suivre le déploiement jusqu'à `live` (journaux en direct). 3. Ouvrir l'adresse du site. 4. Vérifier le certificat. 5. Pousser un commit sur la branche de production et vérifier qu'un nouveau déploiement démarre (webhook). 6. Annuler un déploiement en cours ; en lancer un autre. 7. Redéployer, puis revenir à la version précédente. |
| **Attendu** | Statuts `queued → … → live` ; site servi en HTTPS valide ; `[SSL]` dans le journal ; le push déclenche un déploiement ; annulation et retour arrière respectés. |
| **Mesurer** | Durée de chaque étape ; messages d'erreur éventuels (sont-ils actionnables ?). |
| **Variantes à répéter** | Dépôt **privé** (deploy key) ; dépôt avec `Dockerfile` ; dépôt sans configuration (détection seule). |

## E2 — Restauration complète (la preuve qui compte le plus)

| | |
|---|---|
| **But** | Prouver qu'on récupère les données, pas seulement qu'on les copie. |
| **2a. Base du portail** | `bash scripts/backup-db.sh` puis `bash scripts/restore-test.sh` (non destructif : base jetable `eflex_restore_test`, supprimée ensuite). **Attendu** : tables, utilisateurs, projets et migrations retrouvés ; fichier `restore-test.status` écrit. |
| **2b. Base cliente** | Sur le staging : créer une base PostgreSQL managée, y écrire des lignes repérables, activer la sauvegarde, lancer « Sauvegarder maintenant », **supprimer les lignes**, puis restaurer depuis l'interface (confirmation RESTAURER). **Attendu** : les lignes réapparaissent ; la restauration est consignée. Hors production : `scripts/verify-db-backup.sh` (PostgreSQL jetable). |
| **2c. Copie hors site** | Vérifier que la sauvegarde atteint la destination S3 / B2 ; télécharger un fichier et le restaurer **depuis cette copie**, pas depuis le disque local. |
| **2d. Reconstruction** | Sur une machine vierge : restaurer le portail à partir des seules sauvegardes et du dépôt (sans accès au serveur d'origine). Mesurer le temps. |
| **Preuve** | Sorties des scripts, comptages avant/après, durée totale (RTO mesuré), âge de la sauvegarde restaurée (RPO observé). |
| **Danger** | Ne jamais restaurer sur la base de production. Les scripts refusent un nom sans « test », ne contournez pas ce garde-fou. |

## E3 — Pannes simulées (staging uniquement)

| Panne | Étapes | Attendu |
|---|---|---|
| **Redémarrage de Redis pendant un déploiement** | Lancer un déploiement ; `docker restart eflex-staging-redis` pendant l'étape `building`. | Le job disparaît de la file ; la réconciliation (au plus 5 minutes) le ré-enfile ; le déploiement aboutit ou, au pire, expire par le watchdog (30 min) avec un message clair. Aucun doublon d'application Coolify. |
| **Retour arrière perdu** | Lancer un retour arrière, puis redémarrer Redis. | Le job ré-enfilé garde sa cible (colonne `rollback`) : il ne déploie pas la dernière version. |
| **Coolify injoignable (lecture)** | Régler temporairement `COOLIFY_API_URL` du **staging** sur une adresse injoignable, ouvrir une page qui lit Coolify (journaux, état). | Réessais bornés puis erreur lisible ; pas de page blanche ; retour à la normale à la restauration de l'adresse. |
| **Perte de l'écriture de l'identifiant** | Difficile à provoquer à la main : couvert par les tests unitaires (#228) ; ne pas simuler sur serveur sans besoin. | — |
| **Redémarrage du portail en plein déploiement** | `docker restart` du conteneur du portail du staging. | Le worker reprend les jobs ; le watchdog nettoie les blocages. |

**Attention :** aucun de ces essais ne doit viser la production. Notez le temps de reprise observé.

## E4 — Connexion en production sous Node 24

| | |
|---|---|
| **But** | La régression #196 (connexion cassée sous Node 24) a été corrigée en CI, jamais constatée en production. |
| **Étapes (lecture seule côté serveur)** | 1. Vérifier la version déployée : `bash scripts/deploy-prod.sh --dry-run` (compare au dépôt). 2. Vérifier la version de Node dans le conteneur du portail (`docker exec eflex-portail node -v`). 3. Se connecter avec un compte de test : mot de passe, puis code par e-mail, puis passkey si activée. 4. Vérifier que la déconnexion et le renouvellement de session fonctionnent. |
| **Attendu** | Connexion réussie par chaque méthode ; aucune erreur `Cannot read private member` dans les journaux du portail. |
| **Si échec** | C'est un incident : ouvrir une issue **P0**, capturer le journal. |

## E5 — Paiement réel et webhook

| | |
|---|---|
| **But** | Confirmer qu'un paiement active bien l'abonnement et génère la facture. |
| **Préalables** | Clés **sandbox** d'abord (`KKIAPAY_SANDBOX=true`, `FEDAPAY_SANDBOX=true` : c'est déjà la valeur du staging), puis un paiement **réel de faible montant** en production avec un compte de test, remboursable. |
| **Étapes** | Payer un plan ; vérifier l'activation (`Subscription`), l'historique, la facture PDF, la réception du webhook (signature vérifiée), l'idempotence (rejouer le webhook). Tester un paiement abandonné (expire après 24 h) et un remboursement. |
| **Attendu** | Un seul paiement et une seule prolongation de 30 jours même si le webhook arrive deux fois ; facture cohérente. |
| **Danger** | Un paiement réel engage de l'argent : décision du propriétaire, montant minimal, compte de test. |

## E6 — Une alerte atteint un humain

| | |
|---|---|
| **But** | Aujourd'hui aucun canal sortant n'est garanti vers l'équipe (voir #235). |
| **Étapes (état actuel)** | 1. Provoquer une alerte existante sur le staging (ex. sauvegarde marquée en échec, sonde d'un site en panne). 2. Noter par quel canal elle arrive : notification dans le portail ? e-mail Resend ? 3. Arrêter volontairement le **staging** et vérifier si quelqu'un en est averti sans regarder le portail. |
| **Attendu aujourd'hui** | Notification dans le portail et e-mail seulement si Resend est configuré ; **pas** d'alerte si le serveur entier tombe (c'est la lacune qu'adressent #235, #236, #260). |
| **Objectif après #235/#260** | Arrêter le serveur de production déclenche une alerte reçue sur téléphone depuis la machine de monitoring. |

## Ordre conseillé et durée indicative

1. **E4** (lecture seule, rapide) puis **E2a** (sauvegarde et restauration du portail, script existant).
2. **E1** sur le staging, puis **E2b/E2c**.
3. **E3** (pannes), **E6**.
4. **E2d** (reconstruction) et **E5** (paiement réel) en dernier, avec votre accord.

Les durées dépendent de votre serveur et de vos comptes ; je ne les ai pas mesurées.

## Après les essais

- Chaque écart devient une issue (priorité selon l'impact).
- Mettre à jour [20-capability-matrix.md](../architecture/eflex/20-capability-matrix.md) : un domaine ne passe à « En place » qu'avec la preuve consignée ici.
- Refaire E2a automatiquement chaque semaine (`restore-test.sh` planifié, voir [backups.md](backups.md)) et E4 après chaque mise à jour de Node.
