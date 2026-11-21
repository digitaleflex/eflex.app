# Discovery — Issue #135 : clarté des rôles et actions d’équipe

- **Date** : 2026-11-21
- **Issue** : [#135 `[P2] [XP-3] Collaboration et permissions : clarté des rôles et actions d’équipe`](https://github.com/digitaleflex/eflex.app/issues/135)
- **Périmètre inspecté** : portail Next.js (`portail/src`), Better Auth (`organization`, `admin`), Prisma, UI équipe/facturation/admin.
- **Contrainte** : ne pas modifier le modèle d’autorisation ; améliorer la clarté UI et la cohérence UI/API.

## Constats

### Modèle existant (code-first)

| Zone | Source | Constat |
|---|---|---|
| Résolution locataire | `portail/src/lib/organizations.ts` | `resolveOrganization` borne toute action à l’organisation active du membre ; repli sûr si l’organisation de session n’est plus accessible. |
| Rôles organisation | `lib/organizations.ts`, `lib/auth.ts` | Rôles reconnus : `owner`, `admin`, `billing`, `member`. Better Auth AC redéclare les rôles par défaut et ajoute `billing` avec ressource `billing: read/manage`. |
| Capacités utilitaires | `lib/organizations.ts` | `canManageProjects` = owner/admin ; `canManageBilling` = owner/admin/billing ; `canManageMembers` = owner/admin. |
| UI équipe | `components/organization/organization-panel.tsx`, `app/dashboard/organization/page.tsx` | Page équipe affiche nom, rôles/descriptions, facturation selon rôle, membres, invitations, activité récente, zone sensible. Confirmations pour changement de rôle, retrait, départ, suppression. |
| Invitation | `organization-panel.tsx`, `components/organization/accept-invitation.tsx`, `app/invitations/[id]/page.tsx` | Création par Better Auth client ; lien copié manuellement (envoi e-mail non actif). Acceptation/refus côté invitée. |
| Facturation | `components/organization/billing-card.tsx`, `app/api/billing/*` | API facture/resume/checkout/invoices vérifient `canManageBilling`. UI masque/limite les actions aux personnes autorisées. |
| Audit plateforme | `lib/audit.ts`, `app/admin/audit/*` | Audit admin plateforme complet (acteur, cible, motif, redaction). Distinct de l’activité d’équipe. |
| Activité d’équipe | `dashboard/organization/page.tsx`, `OrganizationPanel` | Affiche 12 derniers événements `member.*` / `invitation.*` depuis `Event` (audience org). Libellés lisibles mais payload limité (pas d’e-mail d’invitation). |
| Auth client | `lib/auth-client.ts` | Messages français pour erreurs Better Auth (rôles, invitations, quotas, limites, permissions). |

### Matrice capacités par rôle (réelle, Better Auth + contrôles applicatifs)

| Capacité | Propriétaire | Administrateur | Facturation | Membre |
|---|:---:|:---:|:---:|:---:|
| Voir les projets de l’organisation | Oui | Oui | Non (pas d’accès projets/journaux) | Oui (lecture) |
| Créer / redéployer / modifier / supprimer des projets | Oui | Oui | Non | Non |
| Gérer les variables d’environnement et journaux sensibles | Oui | Oui | Non | Non |
| Voir et gérer la facturation (plan, paiements, factures) | Oui | Oui | Oui | Non |
| Inviter / modifier rôles / retirer des membres | Oui | Oui | Non | Non |
| Supprimer l’organisation | Oui | Non | Non | Non |
| Administration plateforme EFLEX (`/admin`) | Selon rôle plateforme `admin` vérifié | Selon rôle plateforme `admin` vérifié | Selon rôle plateforme `admin` vérifié | Selon rôle plateforme `admin` vérifié |

> Note : le rôle plateforme `admin` (Better Auth `admin`, issu de `ADMIN_EMAILS` vérifié) est distinct des rôles d’organisation. Il ne doit pas être confondu dans l’UI d’équipe.

## Frictions identifiées

1. **Capacités peu scannables** : les rôles sont décrits textuellement, mais l’issue demande des capacités explicites par rôle (lecture, gestion, facturation, admin). Une matrice compacte réduit l’ambiguïté.
2. **Impact du rôle choisi à l’invitation** : le formulaire d’invitation permet de choisir un rôle, mais n’explique pas l’impact concret du rôle sélectionné avant l’envoi.
3. **Message de facturation imprécis** : `BillingCard` affiche « Réservé aux administrateurs » quand `canManage` est faux ; en pratique ce cas concerne un membre sans droit facturation, mais le libellé ne reflète pas exactement les rôles autorisés (owner/admin/billing).
4. **Acceptation d’invitation générique** : la page d’acceptation explique le principe, mais ne rappelle pas assez l’impact sensible (accès aux projets selon rôle, compte devant correspondre à l’adresse invitée) ni les états d’erreur attendus.
5. **Activité d’équipe peu actionnable** : les événements sont lisibles, mais certains libellés restent génériques faute de payload (email de l’invité non stocké dans l’événement). Il faut l’indiquer clairement comme limite, pas l’inventer.
6. **Cohérence de wording** : certaines surfaces utilisent « administrateur » pour désigner des personnes autorisées à la facturation/projets, ce qui peut être confondu avec l’administrateur plateforme.
7. **Visibilité des contrôles** : les contrôles serveur existent (Better Auth + `canManage*` + routes billing), mais l’UI peut mieux expliciter qu’une action refusée côté serveur est normale et liée au rôle.

## Recommandations priorisées

### Lot A — Faible risque, forte clarté (implémenté)

- Ajouter une matrice de capacités par rôle dans la page Équipe.
- Afficher la description/impact du rôle sélectionné dans le formulaire d’invitation.
- Clarifier les messages de facturation (« personnes autorisées à gérer la facturation »).
- Renforcer la page d’acceptation d’invitation : rappel du compte attendu, impact d’acceptation, accessibilité des messages.
- Harmoniser les libellés sensibles (rôle, accès, effet immédiat) sans changer les permissions.

### Lot B — Moyen risque / données à enrichir

- Enrichir les événements `invitation.*` avec métadonnées non sensibles utiles (rôle invité, domaine e-mail masqué ou identifiant interne) pour rendre l’activité d’équipe plus explicite.
- Ajouter une vue « Qui peut faire quoi sur ce projet ? » contextualisée au projet courant.
- Exposer un historique d’équipe filtrable (rôles, invitations, accès) distinct de l’audit plateforme admin.

### Lot C — Décision produit / sécurité

- Envoi automatique d’e-mails d’invitation avec traçabilité et anti-abus.
- Politique de rôle `billing` sur les écrans projet : aujourd’hui cohérente côté API (pas d’accès projets/journaux), mais la navigation peut être revue selon décision produit.
- Clarifier le modèle « administrateur d’organisation » vs « administrateur plateforme » dans toute la console (glossaire UI).

## Plan de petits lots

1. **Doc + matrice UI équipe** (ce lot) : documentation discovery, matrice capacités, microcopy invitation/facturation/acceptation. Aucun changement d’API.
2. **Audit lisible équipe** : enrichir payloads d’événements d’équipe (migration de contrat événement, sans PII sensible inutile), puis libellés plus précis.
3. **Parcours invitation complet** : e-mail d’invitation, statut, expiration, renvoi, et instrumentation.
4. **Tests accessibilité/UX** : ajouter tests de rendu pour la matrice et les confirmations sensibles (si harness composant disponible).

## Validation prévue

- `pnpm test` ciblé sur modules portail touchés si présents.
- `pnpm --dir portail typecheck` ou `tsc --noEmit --project portail/tsconfig.json` selon l’environnement.
- `npm run lint` dans `portail/` si les dépendances sont installées.

## Changements implémentés dans ce lot

- Documentation de discovery créée.
- UI équipe : matrice de capacités par rôle, rappel d’impact du rôle sélectionné à l’invitation, libellés plus explicites.
- Facturation : message d’accès corrigé pour refléter les rôles autorisés.
- Acceptation d’invitation : texte plus explicite sur le compte attendu et l’effet de l’acceptation.

## Restes à décider

- Faut-il afficher l’e-mail invité (ou une forme masquée) dans l’activité d’équipe ? Cela touche la minimisation de données.
- Le rôle `billing` doit-il avoir une page d’entrée dédiée sans navigation projet ?
- L’administrateur d’organisation doit-il pouvoir voir un audit d’équipe plus détaillé que l’activité récente (et avec quelles garanties) ?
