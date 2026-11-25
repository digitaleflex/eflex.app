# Issues proposées (backlog) — rôles, admin, gestion clients

> Document généré comme base de travail. **À créer manuellement** sur GitHub (ou via `gh issue create`) car aucun outil de création d’issues n’est disponible dans cet environnement.  
> Source d’inspiration : analyse du repo (Better Auth org/admin, `/admin/*` existants, portail Next.js) et besoins exprimés : **super admin**, **admin utilisateurs**, **utilisateurs gérant leurs clients**.

---

## Légende (suggestion de labels)
- `area:auth`, `area:admin`, `area:org`, `area:billing`, `area:ux`, `area:security`
- `priority:p0` (bloquant), `priority:p1`, `priority:p2`
- `type:feature`, `type:chore`, `type:docs`

---

## Épic A — Modèle de rôles et permissions (fondations)

### Issue A1 — Définir et documenter la matrice des rôles plateforme
**Titre :** `[RBAC] Documenter la matrice des rôles plateforme (super_admin, admin_ops, support utilisateurs)`  
**Labels suggérés :** `area:security`, `area:admin`, `type:docs`, `priority:p1`  
**Description :**  
Aujourd’hui le rôle `admin` est piloté via `ADMIN_EMAILS` et le plugin Better Auth admin. Il faut formaliser :
- `super_admin` (tous droits plateforme, gestion des autres admins)
- `admin_ops` (infrastructure, déploiements, support technique)
- `admin_users` (support comptes : recherche, suspension, sécurité compte) — périmètre limité
- Règles d’élévation, MFA recommandé, traçabilité.

**Critères d’acceptation :**
- [ ] Document dans `docs/` (ex. `docs/security/rbac-plateforme.md`) avec tableau rôles × capacités.
- [ ] Liste des actions sensibles et qui peut les faire.
- [ ] Lien depuis `AGENTS.md` ou `docs/architecture/eflex` si pertinent.

---

### Issue A2 — Implémenter des permissions fines (au-delà d’un booléen admin)
**Titre :** `[RBAC] Introduire des permissions granulaires pour les routes /api/admin/*`  
**Labels suggérés :** `area:security`, `area:admin`, `type:feature`, `priority:p1`  
**Description :**  
Remplacer progressivement les gardes “admin ou 404” par des vérifications de capacités (ex. `admin.users.read`, `admin.deployments.write`, `admin.billing.refund`) tout en gardant une compatibilité transitoire.

**Critères d’acceptation :**
- [ ] Inventaire des routes `api/admin/**` et permission associée proposée.
- [ ] Helper central (ex. `requireAdminCapability(...)`) + tests.
- [ ] Migration documentée des rôles existants.

---

### Issue A3 — Clarifier les rôles au sein des Organisations (tenant)
**Titre :** `[Org] Documenter et aligner les rôles d’organisation (owner/admin/member/billing…) avec les capacités`  
**Labels suggérés :** `area:org`, `type:docs`, `priority:p2`  
**Description :**  
Faire correspondre les rôles Better Auth `organization` aux actions réelles (projets, env vars, déploiements, facturation, invitations). Mettre à jour l’UI et les messages d’erreur si nécessaire.

**Critères d’acceptation :**
- [ ] Matrice rôles org × actions (incluant `canManageProjects` actuel).
- [ ] Points de code listés (middlewares/routes) cohérents avec la matrice.

---

## Épic B — Super Admin / Admin plateforme (interfaces)

### Issue B1 — Espace “Utilisateurs” dans l’admin
**Titre :** `[Admin UI] Ajouter une page /admin/users (recherche, filtres, vue détail)`  
**Labels suggérés :** `area:admin`, `area:ux`, `type:feature`, `priority:p1`  
**Description :**  
Créer une interface pour lister/rechercher des utilisateurs (email, nom, statut email vérifié, 2FA activé, dernière connexion si dispo), avec pagination. Vue détail : orgs rattachées, sessions (lecture seule ou liens vers gestion), audit ciblé.

**Critères d’acceptation :**
- [ ] Route UI + API(s) protégées par permissions (voir A2).
- [ ] Aucune fuite de secrets ; actions destructrices auditée.

---

### Issue B2 — Actions de support sur les comptes utilisateurs
**Titre :** `[Admin] Actions support : suspension/réactivation, forcer déconnexion globale (selon politique)`  
**Labels suggérés :** `area:admin`, `area:security`, `type:feature`, `priority:p2`  
**Description :**  
Définir les actions autorisées (juridique/politique à valider) et les implémenter avec audit : par exemple marquer un compte suspendu, révoquer toutes les sessions, etc. (selon capacités Better Auth/plugins).

**Critères d’acceptation :**
- [ ] Liste des actions implémentées et refusées (documentée).
- [ ] Audit obligatoire + confirmation UI pour actions irréversibles.

---

### Issue B3 — Journal d’audit central admin
**Titre :** `[Admin] Page /admin/audit avec filtres et export`  
**Labels suggérés :** `area:admin`, `area:security`, `type:feature`, `priority:p2`  
**Description :**  
Centraliser la consultation des événements d’audit (acteur, cible, action, IP/user-agent si pertinent) avec filtres par date/type/acteur et export CSV limité.

**Critères d’acceptation :**
- [ ] Source de données unique ou agrégation claire (documenter).
- [ ] Rétention et accès restreints (super_admin/admin_ops selon décision A1).

---

### Issue B4 — Durcir l’UI Super Admin (séparation super_admin vs admin_ops)
**Titre :** `[Admin UI] Séparer visuellement et fonctionnellement super admin vs admin ops`  
**Labels suggérés :** `area:admin`, `area:ux`, `type:feature`, `priority:p2`  
**Description :**  
Une fois A1/A2 en place, adapter la navigation et les pages pour masquer/disable les actions non autorisées et afficher clairement le niveau de privilège.

**Critères d’acceptation :**
- [ ] Navigation admin cohérente avec permissions.
- [ ] Tests manuels sur comptes de chaque rôle.

---

## Épic C — Utilisateurs gérant leurs clients (agence / multi-client)

### Issue C1 — Décision produit : modèle “Organisation par client” vs entité “Client” métier
**Titre :** `[Product/Arch] Choisir le modèle de gestion clients (org par client vs table Client)`  
**Labels suggérés :** `area:org`, `type:docs`, `priority:p0`  
**Description :**  
Arbitrer entre :
- **A)** chaque client = une `Organization` Better Auth (isolation forte, invitations, billing par org) ;
- **B)** entité `Client` rattachée à l’org agence (plus léger UX, facturation agrégée possible) avec projets liés au client.

Produire une note ADR courte ou section doc : avantages, impacts Prisma/API/UI, migration.

**Critères d’acceptation :**
- [ ] Document d’architecture validé (choix + conséquences).
- [ ] Checklist d’implémentation pour l’option retenue.

---

### Issue C2 — Écran “Mes clients” (selon modèle retenu en C1)
**Titre :** `[Dashboard] Implémenter la gestion des clients pour les comptes agence`  
**Labels suggérés :** `area:org`, `area:ux`, `type:feature`, `priority:p1`  
**Description :**  
Interface sous `/dashboard/*` pour lister les clients, créer/éditer (selon modèle), switcher le contexte de travail vers un client, et voir un résumé (nb projets, déploiements récents).

**Critères d’acceptation :**
- [ ] Flux de création client documenté et testé.
- [ ] Changement de contexte clair (éviter confusion org active vs client sélectionné).

---

### Issue C3 — Permissions agence : délégation et portée
**Titre :** `[Org] Définir permissions pour qu’une agence agisse pour le compte d’un client`  
**Labels suggérés :** `area:org`, `area:security`, `type:feature`, `priority:p1`  
**Description :**  
Spécifier qui peut créer des projets pour un client, inviter des membres côté client, voir la facturation, etc., avec journalisation des actions “agence → client”.

**Critères d’acceptation :**
- [ ] Matrice agence × client × action.
- [ ] Audit des actions déléguées.

---

### Issue C4 — (Optionnel) Portail client en lecture limitée
**Titre :** `[Product] Étudier un portail client (accès restreint) séparé ou sous-rôle limité`  
**Labels suggérés :** `area:ux`, `type:feature`, `priority:p2`  
**Description :**  
Évaluer le besoin d’un accès client final (voir ses projets/déploiements/logs limités) sans droits agence/admin. Hors périmètre immédiat sauf si validé en C1/C2.

**Critères d’acceptation :**
- [ ] Note de cadrage (besoins, risques, MVP) ou décision “pas maintenant”.

---

## Épic D — Qualité transversale

### Issue D1 — Tests et garde-fous sur les nouvelles routes admin
**Titre :** `[Tests] Ajouter des tests d’isolation tenant et de permissions admin`  
**Labels suggérés :** `area:security`, `type:chore`, `priority:p1`  
**Description :**  
Étendre les suites existantes (ex. tests d’isolation API) pour couvrir les nouveaux endpoints admin/utilisateurs et les scénarios de refus.

**Critères d’acceptation :**
- [ ] Cas “utilisateur normal → 404/403” sur routes admin.
- [ ] Cas “mauvais rôle org” sur actions client/agence.

---

### Issue D2 — Documentation opérateur (runbook)
**Titre :** `[Docs] Runbook : gestion des comptes, incidents accès, escalade admin`  
**Labels suggérés :** `type:docs`, `priority:p2`  
**Description :**  
Décrire les procédures pour le support : suspendre un compte, aider sur 2FA/perte d’accès (dans le cadre légal), qui contacter, audit à vérifier.

**Critères d’acceptation :**
- [ ] Document dans `docs/operations/` ou `docs/security/`.
- [ ] Liens depuis l’interface admin si utile.

---

## Ordre suggéré (rapide)
1. **A1, C1** (décisions et doc)  
2. **A2, A3** (fondations techniques)  
3. **B1, C2, C3** (interfaces cœur)  
4. **B2, B3, B4, D1, D2, C4** (durcissement et compléments)