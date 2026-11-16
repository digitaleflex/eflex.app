# 00 — Vision produit et périmètre

## Définition

**E-FLEX App est une plateforme de déploiement et d'exploitation managée des applications destinée en priorité aux développeurs indépendants, studios et agences numériques.**

Elle transforme un parcours aujourd'hui fragmenté — dépôt Git, configuration, build, serveur, HTTPS, surveillance, sauvegarde et assistance — en un service cohérent. Le développeur livre son application ; E-FLEX automatise les opérations répétitives et fournit un accompagnement opérationnel selon le contrat.

La valeur ne réside pas uniquement dans une console de déploiement. Elle réside dans l'association de :
- déploiement reproductible ;
- hébergement et gestion du runtime ;
- protection des données ;
- surveillance et diagnostic ;
- assistance humaine structurée ;
- gestion de plusieurs clients finaux par un développeur ou une agence.

## Client et utilisateur

- **Acheteur direct initial :** développeur ou agence qui gère plusieurs applications.
- **Utilisateur quotidien :** développeur, responsable technique ou collaborateur autorisé.
- **Client final :** propriétaire du site ou de l'application, avec un accès limité si l'agence le souhaite.
- **Opérateur E-FLEX :** personne chargée de l'exploitation, de la sécurité, du support et des interventions.

E-FLEX vend d'abord à l'agence/développeur ; l'agence conserve la relation commerciale avec son client final. Il s'agit d'un modèle B2B2B.

## Proposition de valeur

« Vous développez et gérez la relation avec vos clients. E-FLEX vous aide à déployer, héberger, surveiller et maintenir leurs applications sans vous imposer toute la complexité de l'exploitation DevOps. »

Ne pas promettre une disponibilité, une restauration ou une prise en charge illimitée sans mécanisme, mesure et contrat correspondants.

## Modèle commercial cible

La facture doit distinguer :
1. **Plateforme** : accès au portail, gestion des projets, déploiements et rapports.
2. **Ressources** : calcul, mémoire, stockage, trafic, bases et builds.
3. **Services managés** : sauvegardes, surveillance renforcée, maintenance et assistance humaine.

Le site/application est une unité commerciale compréhensible pour l'agence, mais les coûts réels dépendent de ses ressources et du temps d'exploitation. Les prix de gros et les forfaits doivent être validés par les coûts observés, non supposés.

## Périmètre de réalisation prioritaire

- Fiabiliser les clients déjà hébergés.
- Mettre en place des sauvegardes clientes restaurables.
- Surveiller individuellement les applications.
- Automatiser le cycle Git → build → déploiement.
- Séparer les builds de la production.
- Renforcer le détecteur sur les dépôts réellement utilisés.
- Donner aux agences une vue de leur portefeuille clients et projets.
- Tracer et valoriser le support.

## Hors périmètre immédiat

- Réécriture globale en Go ou Rust.
- Remplacement immédiat de Coolify.
- Kubernetes comme runtime initial.
- Multi-cloud / multi-région avancé.
- Moteur SEO propriétaire.
- Analytics propriétaire (une mesure d'audience intégrée existe déjà).
- SLA d'entreprise / haute disponibilité non démontrée.
- Support humain illimité dans un forfait d'hébergement.

## Principes de produit

1. L'automatisation doit être visible et explicable.
2. Le portail masque la complexité par défaut, mais les logs et états restent inspectables.
3. Les actions destructrices nécessitent une confirmation explicite.
4. Les données du client restent isolées de celles des autres clients.
5. Une sauvegarde n'est considérée fiable qu'après un test de restauration.
6. Une stack détectée n'est pas automatiquement une stack certifiée en production.
7. Chaque nouvelle fonction doit réduire le temps humain par application ou créer une valeur facturable vérifiable.
