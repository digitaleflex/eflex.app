# Layer 09 — Network Layer

## Rôle

Rendre les applications accessibles via leurs domaines avec routage et TLS, sans que le développeur ait à gérer manuellement le reverse proxy.

## État actuel

Le portail attribue un sous-domaine de plateforme aux projets et pilote Coolify/Traefik. La validité TLS est vérifiée après déploiement. L'assistant de domaine et la vérification DNS existent. La gestion DNS universelle de tous les registrars n'existe pas.

## Composants

- Domaine par défaut E-FLEX.
- Domaines personnalisés rattachés au projet.
- Enregistrements DNS (chez le fournisseur de zone du client).
- Reverse proxy / Traefik.
- Certificats TLS Let's Encrypt.
- Routage vers le port/service cible.
- Vérification HTTP/TLS après déploiement.

## Flux d'ajout d'un domaine

1. Le développeur ajoute un hostname au projet.
2. E-FLEX vérifie la propriété et/ou la configuration DNS prévue.
3. Le client configure les enregistrements requis si la zone n'est pas gérée par E-FLEX.
4. Coolify/Traefik reçoit la configuration du domaine et du service public.
5. Le certificat est demandé/renouvelé par le mécanisme configuré.
6. E-FLEX vérifie la résolution, le TLS et l'accessibilité.

## Sécurité

- Ne pas accepter un hostname arbitraire sans validation.
- Éviter les conflits entre tenants.
- N'exposer que les ports explicitement destinés au trafic public.
- Ne pas rendre les bases de données accessibles publiquement par défaut.
- Documenter les ports et les services internes Compose.

## Critères d'acceptation

- Chaque domaine appartient à un projet et un tenant.
- TLS est vérifié à partir d'une connexion réelle.
- Les erreurs DNS/TLS sont distinguées des erreurs applicatives.
- Les secrets et configurations internes ne sont pas exposés.
