# Axiom Engine

The Engine is the backend foundation for Axiom's deployment platform.

## Local stack

The development compose file needs two things before starting:

```bash
cp .env.example .env                       # secrets locaux, jamais commités
# puis remplacer AXIOM_API_TOKEN / AXIOM_SECRET_KEY (openssl rand -base64 32)
set -a; . ../../config/domains.sh; set +a # source unique des domaines
docker compose -f docker-compose.dev.yml up -d
```

`AXIOM_API_TOKEN` and `AXIOM_SECRET_KEY` are injected via `${VAR:?…}` guards: no
secret is stored in version control and Compose refuses to start if they are missing.

The same file also provides a local PostgreSQL service (the `${VAR:?…}` guards
apply to any `docker compose` invocation, including `up -d postgres`).

Default connection:

```text
postgres://axiom:axiom@localhost:5432/axiom?sslmode=disable
```

## Run the engine

```bash
export DATABASE_URL='postgres://axiom:axiom@localhost:5432/axiom?sslmode=disable'
go run ./cmd/engine
```

Migrations are applied automatically during startup when the database is configured.

## Integration tests

```bash
export AXIOM_TEST_DATABASE_URL='postgres://axiom:axiom@localhost:5432/axiom?sslmode=disable'
go test ./...
```

The PostgreSQL integration tests are skipped when `AXIOM_TEST_DATABASE_URL` is not set. This keeps the default unit-test run independent from an external database while making the integration path explicit.
