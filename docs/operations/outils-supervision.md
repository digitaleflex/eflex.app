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

## Fermer l'accès au public (recommandé)

Trois réglages, cumulables, lus par le portail (`.env.prod`) et appliqués à
l'installation d'un outil ou avec « Nouveau mot de passe » :

| Variable | Effet |
|---|---|
| `OPS_ALLOWED_IPS` | Seules ces adresses ou plages (séparées par des virgules) passent le proxy, **avant** le mot de passe. Une entrée invalide est ignorée et signalée dans l'onglet. |
| `OPS_PRIVATE_NETWORK=tailscale` | Seuls les appareils de votre réseau privé Tailscale passent (100.64.0.0/10, fd7a:115c:a1e0::/48). |
| `OPS_ROOT_DOMAIN` | Domaine dédié aux outils, par exemple `ops.eflex.app` → `logs.ops.eflex.app`. |
| `OPS_CERT_RESOLVER` | Résolveur de certificat Traefik (`letsencrypt` par défaut). Avec une adresse privée, `letsencrypt-dns` (DNS-01). |

L'onglet Supervision affiche le mode d'accès en vigueur.

**Pourquoi pas la connexion admin E-FLEX ?** Les sites clients sont sur
`*.<racine>`. Partager le cookie de session avec les sous-domaines des outils
l'enverrait aussi à tous les sites clients, qui pourraient voler la session
d'administration. Le filtrage par réseau + mot de passe ne crée pas ce risque.

### Mode réseau privé avec Tailscale, pas à pas

Résultat : les outils ne sont joignables que depuis vos appareils, et leur
adresse ne mène à rien depuis Internet.

1. Sur le serveur :
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   tailscale ip -4          # noter l'adresse 100.x.y.z
   ```
2. Sur votre ordinateur et votre téléphone : installer Tailscale et se connecter
   au même compte.
3. DNS (Cloudflare) : enregistrement `A` `*.ops.eflex.app` → `100.x.y.z`,
   **sans proxy** (nuage gris). Une adresse privée dans un DNS public est
   normale : elle n'est joignable que depuis Tailscale.
4. `.env.prod` :
   ```bash
   OPS_ROOT_DOMAIN=ops.eflex.app
   OPS_PRIVATE_NETWORK=tailscale
   OPS_CERT_RESOLVER=letsencrypt-dns
   ```
   Let's Encrypt ne peut pas joindre une adresse privée en HTTP-01 : il faut le
   résolveur DNS-01 (`letsencrypt-dns`, déjà configuré sur le serveur d'après
   `PROD.md` ; vérifier son nom dans la configuration de Traefik).
5. Redéployer le portail (`bash scripts/deploy-prod.sh`), puis dans Supervision :
   « Installer », ou « Nouveau mot de passe » sur un outil déjà installé (il
   prend alors sa nouvelle adresse).

Le même réseau Tailscale servira à relier le futur serveur de build.

### Mode adresses autorisées, sans Tailscale

`OPS_ALLOWED_IPS=<votre IP publique>` suffit, sur le domaine de la plateforme.
Si votre adresse change (box, 4G), il faut la mettre à jour et régénérer le mot de
passe de chaque outil. Ce mode suppose que Traefik voit l'adresse réelle du
visiteur : enregistrements DNS **sans proxy Cloudflare**, comme aujourd'hui.

## Première mise en route

1. **Supervision → Installer** sur chaque outil ; noter l'accès affiché.
2. **Uptime Kuma** : ouvrir l'adresse, s'identifier (accès ci-dessus), créer le compte
   administrateur, ajouter une sonde par site client et un canal d'alerte.
3. **Beszel** : ouvrir l'adresse, créer le compte, puis « Ajouter un système » avec
   l'hôte `/beszel_socket/beszel.sock` ; copier la clé publique et le jeton dans le
   formulaire « Relier l'agent » de la carte Beszel.
4. **Dozzle** : rien à configurer.

Mot de passe perdu : « Nouveau mot de passe » (l'outil redémarre, ses données restent).
