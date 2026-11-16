# Layer 13 — Operations & Business Layer

## Rôle

Transformer les capacités techniques en prestations exploitables, traçables et facturables. Cette couche organise aussi l'intervention humaine qui différencie E-FLEX.

## État actuel

**En place :** tickets d'assistance côté portail, page opérateur `/admin/support`, notifications, organisations, abonnements et paiements ponctuels intégrés.

**À développer :** rattachement complet des tickets aux incidents/déploiements, temps d'intervention, crédits/quota d'assistance, vue portefeuille agence, rapport mensuel par site, facturation consolidée et mesure d'usage complète.

## Modules

### Support

Un ticket doit référencer l'organisation, le client final (si connu), le projet, le type, la priorité, les pièces jointes, les événements techniques pertinents, le statut et la résolution.

### Human Operations

Distinguer :
- incident d'infrastructure couvert par le contrat ;
- diagnostic et maintenance corrective ;
- correction du code ;
- évolution fonctionnelle ;
- audit de sécurité ou intervention spéciale.

Au début, le temps et la nature des interventions peuvent être suivis manuellement. Ne pas développer un moteur de crédits avant qu'un volume réel le justifie. Les prestations non incluses doivent être devisées ou facturées séparément.

### Rapports agence

Un rapport mensuel peut présenter disponibilité mesurée, déploiements, incidents, sauvegardes réussies, restaurations testées, état TLS et consommation. Les valeurs doivent être issues des couches correspondantes ; le rapport ne doit pas extrapoler les données manquantes.

### Billing & Usage

L'abonnement actuel est rattaché à l'organisation. La facturation par agence et par application doit être étudiée sans casser les abonnements existants. L'issue [#143 — facturation à l'usage prépayée](https://github.com/digitaleflex/eflex.app/issues/143) décrit un modèle envisagé ; ses tarifs et règles ne sont pas une fonction achevée.

## Principes de rentabilité

- Mesurer le coût infrastructure par application.
- Mesurer le temps de support par client.
- Fixer un périmètre inclus clair.
- Séparer ressources et prestations humaines.
- Refuser les offres « illimitées » non soutenables.
- Ne promettre SLA/support 24/7 que si l'organisation peut les tenir.

## Critères d'acceptation

- Chaque intervention est historisée.
- Le travail inclus et le travail facturable sont distingués.
- Une agence peut produire un rapport fiable pour chaque site.
- Les montants facturés sont réconciliables avec l'usage enregistré.
- Les tickets sont isolés par tenant et accessibles seulement aux personnes autorisées.
