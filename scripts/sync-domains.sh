#!/usr/bin/env bash
# Régénère les rares fichiers STATIQUES qui ne savent pas interpoler ${VAR}
# (configuration dynamique Traefik, $id du schéma JSON) depuis config/domains.sh.
#
# À lancer après toute modification de EFLEX_ROOT_DOMAIN dans config/domains.sh.
# Usage : bash scripts/sync-domains.sh
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
. ./config/domains.sh
set +a

python3 - <<'PY'
import os, pathlib, re

def render(tpl_path, out_path, keys):
    tpl = pathlib.Path(tpl_path)
    s = tpl.read_text()
    for key in keys:
        s = s.replace('${' + key + '}', os.environ[key])
    if '${' in s:
        raise SystemExit(f'ERREUR : placeholder non résolu dans {tpl_path}')
    pathlib.Path(out_path).write_text(s)
    print(f'  {out_path}  <- {tpl_path}')

# 1. Règles Host() de la config dynamique Traefik (pas d'interpolation native).
render(
    'services/engine/traefik/dynamic/axiom-console.yml.tpl',
    'services/engine/traefik/dynamic/axiom-console.yml',
    ['AXIOM_CONSOLE_DOMAIN', 'ENGINE_API_DOMAIN'],
)

# 2. $id du schéma JSON (identifiant canonique) + sa documentation.
schema_id = os.environ['SCHEMA_ID']

p = pathlib.Path('schema/v1.json')
p.write_text(re.sub(r'("\$id"\s*:\s*")[^"]+(")',
                    lambda m: m.group(1) + schema_id + m.group(2),
                    p.read_text(), count=1))
print(f'  schema/v1.json  -> $id = {schema_id}')

p = pathlib.Path('schema/README.md')
p.write_text(re.sub(r'(`- \$id` : `)[^`]+(`)',
                    lambda m: m.group(1) + schema_id + m.group(2),
                    p.read_text(), count=1))
print(f'  schema/README.md -> $id = {schema_id}')

print(f'\nDomaine racine : {os.environ["EFLEX_ROOT_DOMAIN"]}')
print('Fichiers statiques synchronisés. Relancer ensuite : bash deploy.sh')
PY
