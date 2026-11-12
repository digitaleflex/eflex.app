# Scripts de validation réelle Axiom (#12, #13)

Ces scripts sont des **gabarits opérateur** pour exécuter les validations décrites dans :

- `docs/operations/axiom-traefik-dns-tls-proof.md` (issue #12)
- `docs/operations/axiom-agent-remote-proof.md` (issue #13)

Ils ne réalisent **aucune preuve** à eux seuls et ne doivent pas être interprétés comme une validation automatique. Toute exécution sur infrastructure réelle doit être faite par un opérateur, après relecture et adaptation.

## Principes

- Pas de secrets en dur : utiliser des variables d'environnement ou des fichiers locaux non commités.
- Les scripts de modification système/réseau (`10-provision-vps.sh`, coupures dans `60-agent-failure-drills.sh`) sont **à haut risque** : lire avant d'exécuter, tester sur un VPS jetable.
- Collecter les sorties dans un dossier de preuves horodaté (`collect-evidence.sh`).
- Ne jamais committer les dossiers `evidence/`.

## Contenu

| Fichier | Usage |
|---|---|
| `00-preflight.sh` | Vérifie outils locaux, variables requises, résolution DNS, ports, endpoints. |
| `10-provision-vps.sh` | Gabarit de préparation VPS (Docker, répertoires, Traefik) — à adapter. |
| `20-traefik-tls-verify.sh` | Vérifie DNS/HTTP/HTTPS/certificat et collecte l'état Traefik. |
| `30-deploy-node-python-proof.sh` | Gabarit d'appels API moteur pour créer/déployer et sonder les applications Node/Python. |
| `40-rollback-redploy-proof.sh` | Sondes pendant redéploiement et aide à consigner un scénario d'échec santé/rollback. |
| `50-agent-enroll-remote.sh` | Aide côté opérateur pour bootstrap/enrôlement et vérification de statut agent. |
| `60-agent-failure-drills.sh` | Gabarits de coupure réseau 60 s et collecte (iptables/nft/tc) — **dangereux**. |
| `collect-evidence.sh` | Copie/agrège logs et sorties dans `evidence/issue-*/...`. |
| `agent/axiom-agent.env.example` | Exemple de variables d'environnement agent. |
| `agent/axiom-agent.service.example` | Exemple d'unité systemd agent. |

## Prérequis outils (selon scripts)

`bash`, `curl`, `jq` (recommandé), `dig` ou `host`/`nslookup`, `openssl`, `ssh`, `docker`, `systemctl`, `iptables`/`nft`/`tc` (drills réseau). Les scripts doivent échouer clairement si un outil requis manque.