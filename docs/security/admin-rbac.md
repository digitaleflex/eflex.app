# Matrice des rôles d’administration (ADM-1)

Cette matrice décrit les rôles plateforme stockés dans `User.role`. Le rôle d’organisation (`owner/admin/member/billing`) est distinct et inchangé.

## Rôles

| Rôle | Objet | Accès principaux |
|---|---|---|
| `super_admin` | Administration complète | Toutes les permissions admin, attribution/retrait des rôles, actions destructrices |
| `exploitation` | Exploitation plateforme | Vue d’ensemble, activité, audit, monitoring, déploiements, projets, infrastructure/Coolify en lecture |
| `support` | Support client | Vue d’ensemble, activité, audit, monitoring, déploiements/projets en lecture, utilisateurs/organisations en lecture, support, impersonation encadrée |
| `finance` | Facturation | Vue d’ensemble, audit, organisations en lecture, paiements lecture/gestion |

`ADMIN_EMAILS` ne sert qu’au bootstrap du premier `super_admin` (compte vérifié), uniquement s’il n’existe aucun `super_admin`. Les administrateurs existants sont migrés vers `super_admin`.

## Permissions

Les gardes API/pages utilisent `requireAdminApi(permission)` / `requireAdminPage(permission)` et renvoient 404 si non autorisé.

| Permission | super_admin | exploitation | support | finance |
|---|---:|---:|---:|---:|
| `admin.overview.read` | ✓ | ✓ | ✓ | ✓ |
| `admin.live.read` | ✓ | ✓ | ✓ |  |
| `admin.audit.read` | ✓ | ✓ | ✓ | ✓ |
| `admin.monitoring.read` | ✓ | ✓ | ✓ |  |
| `admin.deployments.read` | ✓ | ✓ | ✓ |  |
| `admin.deployments.manage` | ✓ | ✓ |  |  |
| `admin.projects.read` | ✓ | ✓ | ✓ |  |
| `admin.projects.manage` | ✓ | ✓ |  |  |
| `admin.users.read` | ✓ |  | ✓ |  |
| `admin.users.manage` | ✓ |  |  |  |
| `admin.impersonation.manage` | ✓ |  | ✓ |  |
| `admin.organizations.read` | ✓ |  | ✓ | ✓ |
| `admin.organizations.manage` | ✓ |  |  |  |
| `admin.payments.read` | ✓ |  |  | ✓ |
| `admin.payments.manage` | ✓ |  |  | ✓ |
| `admin.support.read` | ✓ |  | ✓ |  |
| `admin.support.manage` | ✓ |  | ✓ |  |
| `admin.infrastructure.read` | ✓ | ✓ |  |  |
| `admin.infrastructure.manage` | ✓ |  |  |  |
| `admin.coolify.read` | ✓ | ✓ |  |  |
| `admin.coolify.manage` | ✓ |  |  |  |
| `admin.roles.manage` | ✓ |  |  |  |

## Contrôles

- 404 pour masquer la zone admin aux comptes non autorisés.
- Double authentification obligatoire pour `/admin` et `api/admin/**` (ADM-2), sauf délai de grâce `ADMIN_2FA_ENFORCE_AFTER`.
- Impersonation : motif obligatoire, durée max 30 min, expiration forcée, audit, notification propriétaire.
- Tout changement de rôle admin doit être audité ; impossible de retirer le dernier `super_admin`.
