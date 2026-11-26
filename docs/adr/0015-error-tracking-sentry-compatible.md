# ADR-0015 — Suivi des erreurs applicatives via endpoint compatible Sentry

- **Statut** : Accepté
- **Date** : 2026-11-26
- **Issues** : #237, #232

## Contexte

Les erreurs serveur du portail et du worker ne sont pas centralisées. La régression #196 n’a été détectée que via la CI. Il faut un suivi d’erreurs auto-hébergeable, simple à exploiter, sans construire un produit maison.

## Décision

1. **Bugsink en premier choix** : un conteneur, compatible SDK Sentry, faible empreinte opérationnelle. **GlitchTip** reste l’alternative si le besoin évolue vers disponibilité/performance/produit plus riche.
2. Le portail intègre un **client serveur minimal compatible Sentry** (`portail/src/lib/error-tracking.ts`), sans dépendance lourde obligatoire. Il envoie des enveloppes Sentry si `SENTRY_DSN` (ou `ERROR_TRACKING_DSN`) est défini ; **inerte si absent**.
3. Les données sensibles sont nettoyées avant envoi : secrets, jetons, cookies, authorization, mots de passe, corps de requêtes d’authentification. Les étiquettes autorisées incluent route, version/SHA, identifiant d’organisation, jamais d’e-mail.
4. Le service est déployé comme service Coolify derrière authentification, sur un sous-domaine réservé (`errors.<racine>` / `bugsink.<racine>`).

## Conséquences

- Pas d’impact si DSN absent.
- Les erreurs Next.js serveur sont capturées via `instrumentation.onRequestError`.
- Le worker et les handlers peuvent appeler `captureServerError` pour les erreurs métier importantes.
- Les alertes « nouvelle erreur » seront branchées via la chaîne d’alertes OBS-7.
