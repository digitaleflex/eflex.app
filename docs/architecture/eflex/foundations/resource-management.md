# Foundation — Resource Management

## Rôle

Connaître, répartir et limiter les ressources consommées par le portail, les builds et les applications clientes afin d'éviter qu'une tâche ou un tenant affecte tous les autres.

## État actuel

Des métriques CPU/RAM d'application peuvent être récupérées via Coolify selon les capacités et la configuration de l'API. Les limites de ressources par application et par plan ne sont pas encore considérées comme entièrement appliquées. L'issue [#131 — limites CPU/RAM](https://github.com/digitaleflex/eflex.app/issues/131) est ouverte.

## Dimensions à suivre

- CPU : limite, consommation, throttling.
- RAM : limite, pic, OOM.
- Disque : espace, croissance, cache de build.
- Réseau : trafic et transferts.
- Builds : concurrence, durée, espace temporaire.
- Runtime : ressources réservées et consommées.
- Storage : volumes et capacité de sauvegarde.

## Politique initiale

- Un build simultané par worker jusqu'à mesure suffisante.
- File d'attente si capacité épuisée.
- Limites CPU/RAM appliquées au niveau runtime lorsqu'elles sont supportées.
- Alertes avant saturation disque.
- Nettoyage contrôlé du cache et des espaces temporaires.
- Aucun nouveau VPS sans mesure de saturation ou revenu qui le finance.

## Plan de capacité

Avant d'acheter un serveur de build :
1. choisir trois dépôts représentatifs ;
2. mesurer RAM/CPU/disque/durée sur le runtime actuel ;
3. mesurer la même charge sur un worker séparé ;
4. mesurer le gain de cache ;
5. calculer le coût par build et le coût par application ;
6. ne déplacer la charge que si le gain et l'isolation justifient le coût.

## Critères d'acceptation

- Les limites affichées correspondent à des limites réellement appliquées.
- Un build n'épuise pas les ressources indispensables au runtime.
- Les métriques ont une granularité et une rétention documentées.
- La facturation est cohérente avec la ressource réservée ou consommée annoncée.
- Le dépassement produit un état explicite et une alerte.
