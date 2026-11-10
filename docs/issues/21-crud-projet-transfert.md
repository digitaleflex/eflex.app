# #21 · CRUD complet du projet — transfert et historique paginé

> **Mise à jour (nov. 2026).** Le CRUD du projet (renommage, branche, variables, domaines,
> suppression, actions runtime) était déjà livré. Cette note consigne les règles du **transfert
> vers une autre organisation** et de l'**API d'historique des déploiements**.

## Transfert de projet

Route : `POST /api/projects/[id]/transfer`, corps `{ "organizationId": "…" }`.
Logique : `portail/src/lib/project-transfer.ts`. Interface : carte **Transfert** dans
`/dashboard/projects/[id]/settings`.

### Autorisation

- L'acteur doit être **propriétaire ou administrateur** de l'organisation **source** (celle de la
  session active) **et** de l'organisation **cible**. Un simple membre est refusé des deux côtés
  (403). Les rôles sont relus en base, jamais pris dans le corps de la requête.
- L'organisation source est `resolveOrganization(session)` ; le projet doit lui appartenir, sinon
  404 (aucune fuite sur l'existence d'un projet d'un autre locataire).
- Une organisation cible inconnue et une organisation cible dont l'utilisateur n'est que membre
  donnent la même réponse 403.
- Un administrateur de plateforme n'a **pas** de dérogation : le transfert reste une opération
  d'organisation.

### Refus métier

| Cas | Statut | Code |
|---|---|---|
| Organisation cible identique à la source | 400 | `same_organization` |
| Déploiement actif (`ACTIVE_DEPLOYMENT_STATUSES`) | 409 | `deployment_in_progress` |
| Quota de projets de la cible atteint (`assertProjectQuota`) | 403 | `plan_limit` |
| Projet déplacé entre-temps (double soumission) | 409 | `project_moved` |

Le transfert est refusé pendant un déploiement actif parce que le worker écrit des événements et
des notifications pour l'organisation du projet : changer cette organisation sous ses pieds
produirait des événements incohérents.

### Effets

- Seul `Project.organizationId` change. Le créateur (`Project.userId`) reste l'historique.
- **Variables d'environnement** : aucune réécriture. L'AAD de chiffrement est `projectId:clé`, et
  le `projectId` ne change pas, donc les valeurs restent déchiffrables sans jamais transiter en
  clair. Aucune route ne renvoie de valeur.
- **Domaines, bases de données, déploiements** suivent le projet par leurs relations ; le domaine
  Eflex, le slug, les labels Traefik et l'application Coolify ne sont pas recréés.
- **Facturation et quota** : le projet compte désormais dans le plan de l'organisation cible ; le
  quota de la source est libéré. Le contrôle du quota de domaines à l'arrivée n'est pas refait
  (le transfert ne crée pas de domaine).
- Un événement `project.transferred` est publié dans **chaque** organisation, avec
  `direction: "out"` pour la source et `"in"` pour la cible.
- Une entrée d'audit `project.transfer` est écrite (`organizationId` = source) avec les identifiants
  et noms des deux organisations. Le journal d'audit est aussi visible par l'administration.
- L'interface bascule l'organisation active vers la destination après succès pour que le projet
  reste accessible immédiatement.

### Limites connues

- Environnements de prévisualisation non traités (aucun modèle dédié).
- Pas de transfert groupé ni d'annulation : un transfert réussi se refait par un transfert inverse
  manuel.
- Aucune notification e-mail n'est envoyée aux membres des organisations lors d'un transfert.

## Historique des déploiements

Route : `GET /api/projects/[id]/deployments`.

- Réservée aux membres de l'organisation du projet (401 sans session, 404 hors organisation).
- Pagination par curseur : `?limit=20&before=<id>&status=<statut>`.
- `limit` est borné entre 1 et 50 ; `status` doit appartenir à la machine à états
  (`queued`, `analyzing`, `provisioning`, `building`, `deploying`, `live`, `failed`, `cancelled`).
- Tri décroissant sur `(createdAt, id)` ; la réponse renvoie `deployments` (avec le libellé
  français du statut) et `nextCursor` (`null` sur la dernière page).
