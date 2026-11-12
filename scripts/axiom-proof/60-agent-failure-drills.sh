#!/usr/bin/env bash
# Gabarits de scénarios de panne réseau pour #13 (coupure 60 s, idempotence).
# ATTENTION : les commandes de pare-feu/réseau peuvent couper l'accès SSH.
# À exécuter uniquement par un opérateur qui comprend l'impact, avec accès console de secours.
set -euo pipefail

log() { printf '[agent-drills] %s\n' "$*"; }
die() { printf '[agent-drills][ERREUR] %s\n' "$*" >&2; exit 1; }

: "${OUT_DIR:=./evidence-agent-drills-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

usage() {
  cat <<'USAGE'
Usage:
  60-agent-failure-drills.sh snapshot
  60-agent-failure-drills.sh cut-60 <engine_host_or_ip> <engine_port>
  60-agent-failure-drills.sh restore

Variables:
  I_UNDERSTAND_NETWORK_CUT=1  requis pour cut-60/restore
  FW_BACKEND=iptables|nft      backend explicite (sinon auto)
  CUT_CHAIN=AXIOM_PROOF_CUT    nom de chaîne/objet utilisé

Ce script ne déclenche pas de déploiement. Il fournit uniquement des primitives
de coupure/rétablissement à coordonner avec un déploiement en cours.
USAGE
}

require_ack() {
  [ "${I_UNDERSTAND_NETWORK_CUT:-0}" = "1" ] || die "définir I_UNDERSTAND_NETWORK_CUT=1 après relecture (risque de perte d'accès)"
}

snapshot() {
  log "snapshot état réseau/conteneurs"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$OUT_DIR/snapshot-time.txt"
  (ip addr || ifconfig || true) >"$OUT_DIR/ip-addr.txt" 2>&1 || true
  (ss -s || true) >"$OUT_DIR/ss-s.txt" 2>&1 || true
  (docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}' || true) >"$OUT_DIR/docker-ps.txt" 2>&1 || true
  if command -v iptables >/dev/null 2>&1; then iptables-save >"$OUT_DIR/iptables-save.txt" 2>&1 || true; fi
  if command -v nft >/dev/null 2>&1; then nft list ruleset >"$OUT_DIR/nft-ruleset.txt" 2>&1 || true; fi
}

cut_iptables() {
  local host="$1" port="$2"
  log "coupure iptables vers $host:$port pendant 60s"
  iptables -N "$CUT_CHAIN" 2>/dev/null || iptables -F "$CUT_CHAIN"
  iptables -I OUTPUT 1 -j "$CUT_CHAIN"
  iptables -A "$CUT_CHAIN" -p tcp -d "$host" --dport "$port" -j DROP
  iptables -A "$CUT_CHAIN" -p udp -d "$host" --dport "$port" -j DROP
  date -u +%Y-%m-%dT%H:%M:%SZ >"$OUT_DIR/cut-start.txt"
  sleep 60
  date -u +%Y-%m-%dT%H:%M:%SZ >"$OUT_DIR/cut-end.txt"
  restore_iptables
}

restore_iptables() {
  log "rétablissement iptables"
  iptables -D OUTPUT -j "$CUT_CHAIN" 2>/dev/null || true
  iptables -F "$CUT_CHAIN" 2>/dev/null || true
  iptables -X "$CUT_CHAIN" 2>/dev/null || true
}

cut_nft() {
  local host="$1" port="$2"
  die "backend nft non implémenté dans ce gabarit : implémentez une règle temporaire explicite et réversible, puis documentez-la dans les preuves"
}

restore_nft() {
  log "rétablissement nft (gabarit vide)"
}

cmd="${1:-}"
case "$cmd" in
  snapshot)
    snapshot
    log "snapshot écrit dans $OUT_DIR"
    ;;
  cut-60)
    require_ack
    host="${2:-}"; port="${3:-}"
    [ -n "$host" ] && [ -n "$port" ] || die "usage: cut-60 <engine_host_or_ip> <engine_port>"
    backend="${FW_BACKEND:-}"
    if [ -z "$backend" ]; then
      if command -v iptables >/dev/null 2>&1; then backend=iptables; else backend=nft; fi
    fi
    snapshot
    case "$backend" in
      iptables) cut_iptables "$host" "$port" ;;
      nft) cut_nft "$host" "$port" ;;
      *) die "backend inconnu: $backend" ;;
    esac
    snapshot
    log "coupure terminée. Vérifiez idempotence/doublons dans logs moteur+agent et état Docker."
    ;;
  restore)
    require_ack
    backend="${FW_BACKEND:-iptables}"
    case "$backend" in
      iptables) restore_iptables ;;
      nft) restore_nft ;;
      *) die "backend inconnu: $backend" ;;
    esac
    ;;
  ""|-h|--help) usage ;;
  *) usage; exit 2 ;;
esac