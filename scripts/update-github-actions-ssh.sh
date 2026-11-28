#!/usr/bin/env bash
# Met à jour l'ensemble ipset `gh-actions` avec les plages d'IP officielles des
# runners GitHub Actions, puis s'assure qu'une règle iptables autorise ces IP
# vers le port SSH (22). Exécuté à la main et par cron (quotidien), car GitHub
# fait évoluer ces plages.
#
# Usage : sudo bash scripts/update-github-actions-ssh.sh
#
# Sécurité : on n'ouvre PAS le port 22 au monde entier ; seules les IP des
# runners hébergés GitHub (publiées par https://api.github.com/meta) sont
# acceptées. Le reste du filtrage SSH (clé, commande forcée, fail2ban) reste.
set -euo pipefail

SET_NAME="gh-actions"
SET_NAME_V6="gh-actions-v6"
PORT="22"
META_URL="https://api.github.com/meta"
META_FILE="$(mktemp)"
trap 'rm -f "$META_FILE"' EXIT

if [[ $EUID -ne 0 ]]; then
  echo "ERREUR : relance avec sudo." >&2
  exit 1
fi

echo "==> Récupération des plages GitHub Actions depuis $META_URL"
curl -fsS --max-time 30 "$META_URL" -o "$META_FILE"

echo "==> Construction des ensembles ipset"
ipset create -exist "$SET_NAME" hash:net family inet
ipset create -exist "$SET_NAME_V6" hash:net family inet6
ipset flush "$SET_NAME"
ipset flush "$SET_NAME_V6"

python3 - "$META_FILE" "$SET_NAME" "$SET_NAME_V6" <<'PY' | ipset restore -exist
import ipaddress, json, sys

meta_file, set4, set6 = sys.argv[1], sys.argv[2], sys.argv[3]
with open(meta_file) as f:
    ranges = json.load(f).get("actions", [])

n4 = n6 = 0
for cidr in ranges:
    net = ipaddress.ip_network(cidr)
    print(f"add {set4 if net.version == 4 else set6} {cidr}")
    if net.version == 4:
        n4 += 1
    else:
        n6 += 1
print(f"# ipv4={n4} ipv6={n6}", file=sys.stderr)
PY

echo "==> Règle iptables (port $PORT autorisé depuis l'ipset)"
RULE_V4="-p tcp --dport ${PORT} -m set --match-set ${SET_NAME} src -j ACCEPT"
RULE_V6="-p tcp --dport ${PORT} -m set --match-set ${SET_NAME_V6} src -j ACCEPT"

# Insère la règle en tête de la chaîne INPUT si elle n'existe pas déjà.
iptables -C INPUT $RULE_V4 2>/dev/null || iptables -I INPUT 1 $RULE_V4
ip6tables -C INPUT $RULE_V6 2>/dev/null || ip6tables -I INPUT 1 $RULE_V6

echo "==> Sauvegarde (persistance au redémarrage)"
ipset save > /etc/ipset.conf
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || true
fi

echo "==> Terminé. Règles actives :"
iptables -L INPUT -n --line-numbers 2>/dev/null | grep -i "$SET_NAME" || true
ip6tables -L INPUT -n --line-numbers 2>/dev/null | grep -i "$SET_NAME_V6" || true
