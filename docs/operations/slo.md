# SLI / SLO — portail EFLEX (OBS-11)

Ce document définit les indicateurs observés sur `/status` et des cibles internes initiales. **Ces cibles ne sont pas contractuelles** tant qu’elles n’ont pas été validées produit/juridique.

## SLI observés

| SLI | Source | Fenêtre |
|---|---|---|
| Disponibilité composants | `StatusCheck` (sondes portail/DB/Redis/Coolify/moteur) | 24 h / 7 j / 30 j |
| Latence moyenne sondes | `StatusCheck.latencyMs` | 24 h |
| Taux de succès déploiements | `Deployment.status = live` / terminés (`live|failed|cancelled`) | 24 h / 7 j |

## Cibles internes initiales (recommandées)

| Service | SLO interne | Remarque |
|---|---:|---|
| Portail EFLEX | 99,5 % / 30 j | Hors maintenance annoncée |
| Base de données | 99,5 % / 30 j | Critique |
| Déploiements (pipeline) | 99,0 % succès / 7 j | Exclure annulations manuelles si besoin d’affiner |
| Latence sonde portail | p50 < 500 ms | Indicatif, pas contractuel |

## Politique

- Les incidents publics sont déclarés manuellement ; un incident non déclaré n’est pas une preuve d’absence d’incident.
- Revoir les cibles après 2 à 4 semaines de mesures réelles.
- Toute publication contractuelle (SLA) doit être validée séparément.
