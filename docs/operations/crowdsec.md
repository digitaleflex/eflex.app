# CrowdSec devant Traefik (SEC-5)

Objectif : bloquer les IP malveillantes avant qu’elles n’atteignent le portail EFLEX, sans développer de WAF maison.

## Principe

- **CrowdSec** lit les journaux Traefik (et éventuellement SSH/nginx/app) et prend des décisions.
- Le **bouncer Traefik** applique les décisions au niveau du reverse proxy.
- Les décisions et alertes sont visibles dans l’interface CrowdSec ou via ses API ; l’intégration EFLEX reste minimale (lien/état, pas de stockage maison).

## Déploiement recommandé

1. Déployer CrowdSec (LAPI + agent) comme service Coolify ou stack Docker sur le même hôte que Traefik.
2. Monter les journaux Traefik en lecture seule dans l’agent CrowdSec.
3. Installer le bouncer Traefik (`crowdsec-bouncer-traefik-plugin` ou bouncer ForwardAuth selon la topologie).
4. Déclarer le bouncer dans la configuration statique/dynamique Traefik.
5. Réserver un sous-domaine d’administration si une UI est exposée (derrière authentification, IP allowlist ou VPN).

## Configuration Traefik (exemple plugin)

À adapter au déploiement réel. Ne pas exposer la clé bouncer dans le dépôt.

```yaml
# traefik.yml (statique)
experimental:
  plugins:
    crowdsec-bouncer-traefik-plugin:
      moduleName: github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin
      version: v1.4.2
```

```yaml
# dynamique
http:
  middlewares:
    crowdsec:
      plugin:
        crowdsec-bouncer-traefik-plugin:
          enabled: true
          crowdsecLapiKey: ${CROWDSEC_BOUNCER_KEY}
          crowdsecLapiHost: crowdsec:8080
```

Appliquer le middleware `crowdsec@file` aux routeurs publics, pas aux sondes internes de santé.

## Contrôles

- Ne pas bloquer `/api/health`, `/status`, ni les webhooks signés sans test préalable.
- Journaliser les décisions CrowdSec (audit infra), pas les corps de requêtes.
- Vérifier les faux positifs après activation (mode log avant ban si possible).
- Documenter la procédure de déblocage d’urgence (désactiver middleware + vider décision).

## EFLEX

- Ajouter la visibilité “état CrowdSec” dans `/admin/infrastructure` ou Supervision quand l’instance est installée.
- Alerter via OBS-7 sur pic de bans ou indisponibilité du bouncer.
- Ne pas stocker de copies des journaux Traefik dans la base EFLEX.
