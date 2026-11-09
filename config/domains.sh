#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# SOURCE UNIQUE DES DOMAINES / URLS PUBLIQUES EFLEX
# ═══════════════════════════════════════════════════════════════════════════
# AUCUN secret ici : ce sont des noms DNS et des URLs publics. Ce fichier est
# versionné et peut être sourcé par n'importe quel script ou shell.
#
# POUR CHANGER DE DOMAINE : modifier UNIQUEMENT EFLEX_ROOT_DOMAIN ci-dessous,
# puis :
#   1. bash scripts/sync-domains.sh     # régénère les fichiers statiques
#   2. bash deploy.sh                  # redéploie (domaine lu depuis ce fichier)
#
# Toutes les autres valeurs sont dérivées. NE PLUS coder de domaine en dur dans
# les fichiers compose, les scripts, le code ou les labels Traefik : utiliser
# ${VAR} (Compose) ou les variables exportées ci-dessous (shell / scripts).
#
# Usage :
#   set -a; . ./config/domains.sh; set +a
# ═══════════════════════════════════════════════════════════════════════════

EFLEX_ROOT_DOMAIN=eflex.app

# --- Portail / console EFLEX (apex) ------------------------------------------
PORTAL_DOMAIN="${EFLEX_ROOT_DOMAIN}"
PORTAL_URL="https://${PORTAL_DOMAIN}"
BETTER_AUTH_URL="${PORTAL_URL}"
GOOGLE_OAUTH_REDIRECT="${PORTAL_URL}/api/auth/callback/google"

# --- Moteur Axiom -------------------------------------------------------------
ENGINE_API_DOMAIN="api.${EFLEX_ROOT_DOMAIN}"
ENGINE_API_URL="https://${ENGINE_API_DOMAIN}"
AXIOM_CONSOLE_DOMAIN="axiom.${EFLEX_ROOT_DOMAIN}"
AXIOM_CONSOLE_URL="https://${AXIOM_CONSOLE_DOMAIN}"

# --- Applications clientes déployées ------------------------------------------
WILDCARD_DOMAIN="*.${EFLEX_ROOT_DOMAIN}"

# --- Certificats / identifiants publics ---------------------------------------
ACME_EMAIL="admin@${EFLEX_ROOT_DOMAIN}"
SCHEMA_ID="https://${EFLEX_ROOT_DOMAIN}/schema/v1.json"

export EFLEX_ROOT_DOMAIN PORTAL_DOMAIN PORTAL_URL BETTER_AUTH_URL GOOGLE_OAUTH_REDIRECT
export ENGINE_API_DOMAIN ENGINE_API_URL AXIOM_CONSOLE_DOMAIN AXIOM_CONSOLE_URL
export WILDCARD_DOMAIN ACME_EMAIL SCHEMA_ID
