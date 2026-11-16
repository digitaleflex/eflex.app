# Outils de supervision de la plateforme

> Installés depuis **Administration → Pilotage Coolify → Supervision**. Rien à faire
> dans l'interface de Coolify.

| Outil | Adresse | Rôle |
|---|---|---|
| Uptime Kuma | `https://uptime.<racine>` | Vérifie que les sites répondent, alerte (e-mail, Telegram, WhatsApp…) |
| Beszel | `https://metrics.<racine>` | Processeur, mémoire, disque, réseau des serveurs et de chaque conteneur |
| Dozzle | `https://logs.<racine>` | Journaux de tous les conteneurs en direct (lecture seule) |

`<racine>` = `EFLEX_ROOT_DOMAIN` (`config/domains.sh`). Le DNS wildcard `*.<racine>`
pointe déjà sur le serveur : aucun enregistrement DNS à créer. Le certificat HTTPS est
émis par Traefik à la première visite.

## Sécurité

- Chaque outil est derrière une **authentification HTTP posée par Traefik**
  (utilisateur `admin`, mot de passe aléatoire de 24 caractères). Il n'est affiché
  **qu'une fois**, à l'installation ou avec « Nouveau mot de passe », et n'est stocké
  nulle part (ni dans E-FLEX, ni dans le journal d'audit). Le hachage `{SHA}` est
  accepté par Traefik et ne contient pas de `$` à échapper ; il est sûr ici parce que
  le mot de passe est long et aléatoire.
- Cette authentification empêche aussi un inconnu de créer le premier compte
  administrateur d'Uptime Kuma ou de Beszel avant vous : créez-le dès la première
  ouverture.
- Les modèles « en un clic » de Coolify ne sont pas utilisés : celui de Dozzle crée un
  compte `admin` / `test`, et leurs labels visent des entrypoints absents du Traefik de
  l'hôte. E-FLEX génère ses propres fichiers compose (`portail/src/lib/ops-tools.ts`),
  avec les labels `websecure` / `letsencrypt` sur le réseau `proxy`.
- Dozzle et l'agent Beszel lisent le socket Docker **en lecture seule** ; les actions
  et le terminal de Dozzle sont désactivés.
- Les sous-domaines de la plateforme (`uptime`, `metrics`, `logs`, `api`, `coolify`…)
  ne peuvent pas devenir le slug d'un projet client (`lib/reserved-subdomains.ts`).

## Première mise en route

1. **Supervision → Installer** sur chaque outil ; noter l'accès affiché.
2. **Uptime Kuma** : ouvrir l'adresse, s'identifier (accès ci-dessus), créer le compte
   administrateur, ajouter une sonde par site client et un canal d'alerte.
3. **Beszel** : ouvrir l'adresse, créer le compte, puis « Ajouter un système » avec
   l'hôte `/beszel_socket/beszel.sock` ; copier la clé publique et le jeton dans le
   formulaire « Relier l'agent » de la carte Beszel.
4. **Dozzle** : rien à configurer.

Mot de passe perdu : « Nouveau mot de passe » (l'outil redémarre, ses données restent).
