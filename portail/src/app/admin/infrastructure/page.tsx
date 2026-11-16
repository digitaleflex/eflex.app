import Link from 'next/link'
import { CircleAlert, ShieldCheck } from 'lucide-react'
import { requireAdminPage } from '@/lib/admin'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LevelBadge } from '@/components/admin/infrastructure-level'
import { InfrastructureCheckButton } from '@/components/admin/infrastructure-check'
import { InfrastructureSettingsForm } from '@/components/admin/infrastructure-settings'
import { isDeploymentStatus, STATUS_LABELS } from '@/lib/deployment-state'
import { MAX_ANNOUNCEMENT, MAX_MAINTENANCE_MESSAGE } from '@/lib/platform-settings'
import {
  CERT_WARNING_DAYS,
  CONNECTION_DANGER_RATIO,
  CONNECTION_WARNING_RATIO,
  HEALTH_LABELS,
  METRICS_DANGER_PERCENT,
  METRICS_WARNING_PERCENT,
  SOURCE_ERROR_LABELS,
  formatBytes,
  formatLatency,
  type HealthLevel,
} from '@/lib/infrastructure-health'
import { collectInfrastructure, type SourceInfo, type SourceKey } from './collect'

export const metadata = { title: 'Infrastructure — Administration EFLEX' }
// Sondes réseau et base à chaque visite : jamais de cache.
export const dynamic = 'force-dynamic'

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' })
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const number = new Intl.NumberFormat('fr-FR')

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  )
}

/** Erreur d'une source : rouge vif, avec la catégorie puis la raison expurgée. */
function SourceError({ source }: { source: SourceInfo }) {
  if (!source.error) return null
  const prefix = source.errorKind ? `${SOURCE_ERROR_LABELS[source.errorKind]} : ` : ''
  return (
    <p
      role={source.level === 'danger' ? 'alert' : 'status'}
      className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <span className="font-medium">{prefix}</span>
      {source.error}
    </p>
  )
}

function serverLevel(reachable: boolean | null): HealthLevel {
  if (reachable === null) return 'unknown'
  return reachable ? 'ok' : 'danger'
}

export default async function AdminInfrastructurePage() {
  await requireAdminPage()
  const snapshot = await collectInfrastructure()

  const byKey = new Map(snapshot.sources.map((source) => [source.key, source]))
  const fallbackSource = (key: SourceKey): SourceInfo => ({
    key,
    label: key,
    level: 'unknown',
    latencyMs: null,
    error: null,
    errorKind: null,
    checkedAt: snapshot.collectedAt,
  })
  const src = (key: SourceKey) => byKey.get(key) ?? fallbackSource(key)

  const degraded = snapshot.sources.filter(
    (source) => source.level === 'danger' || source.level === 'warning',
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="Infrastructure"
        description={
          <>
            Hébergement, base de données, certificats et file de déploiements. Chaque source est interrogée séparément
            avec un délai court : une source injoignable s’affiche en rouge sans empêcher les autres de s’afficher.{' '}
            <span className="block pt-1 text-xs">
              Relevé du <time dateTime={snapshot.collectedAt}>{dateTime.format(new Date(snapshot.collectedAt))}</time>{' '}
              en {formatLatency(snapshot.durationMs)} ·{' '}
              <a href="#reglages" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                Réglages de la plateforme
              </a>{' '}
              ·{' '}
              <Link href="/admin/audit" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                Journal d’audit
              </Link>
            </span>
          </>
        }
        actions={
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">État global</span>
              <LevelBadge level={snapshot.overall} />
            </div>
            <InfrastructureCheckButton />
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-lg font-semibold">Synthèse</h2>
          <p className="text-sm text-muted-foreground">
            Vue d’ensemble des signaux critiques avant le détail par source.
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <DataRow label="Hébergement (Coolify)">
              <span className="inline-flex items-center gap-2">
                <LevelBadge level={src('coolify').level} />
                {snapshot.coolify.reachable ? `${number.format(snapshot.coolify.applications.length)} app.` : 'injoignable'}
              </span>
            </DataRow>
            <DataRow label="Base de données">
              <span className="inline-flex items-center gap-2">
                <LevelBadge level={src('database').level} />
                {snapshot.database.connections === null
                  ? '—'
                  : snapshot.database.maxConnections === null
                    ? `${number.format(snapshot.database.connections)} connexions`
                    : `${number.format(snapshot.database.connections)} / ${number.format(snapshot.database.maxConnections)}`}
              </span>
            </DataRow>
            <DataRow label="Déploiements">
              <span className="inline-flex items-center gap-2">
                <LevelBadge level={src('deployments').level} />
                {number.format(snapshot.deployments.summary.active)} en cours · {number.format(snapshot.deployments.stale)} bloqué
                {snapshot.deployments.stale > 1 ? 's' : ''}
              </span>
            </DataRow>
            <DataRow label="File BullMQ">
              <span className="inline-flex items-center gap-2">
                <LevelBadge level={src('queue').level} />
                {snapshot.queue.counts
                  ? `${number.format(snapshot.queue.counts.waiting)} en attente · ${number.format(snapshot.queue.counts.failed)} en échec`
                  : 'indisponible'}
              </span>
            </DataRow>
            <DataRow label="Certificats TLS">
              <span className="inline-flex items-center gap-2">
                <LevelBadge level={snapshot.certificates.level} />
                {number.format(snapshot.certificates.warning)} à surveiller · {number.format(snapshot.certificates.expired)} expiré
                {snapshot.certificates.expired > 1 ? 's' : ''}
              </span>
            </DataRow>
            <DataRow label="Applications sans projet">
              {snapshot.projects.error
                ? 'indisponible'
                : `${number.format(snapshot.projects.orphans.length)} orpheline${snapshot.projects.orphans.length > 1 ? 's' : ''} sur ${number.format(snapshot.projects.total)}`}
            </DataRow>
          </dl>
        </CardContent>
      </Card>

      {degraded.length > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-wrap items-start gap-3 p-4">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {snapshot.overall === 'danger'
                  ? 'Une source est indisponible : la plateforme est dégradée.'
                  : 'Une source demande votre attention.'}
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {degraded.map((source) => (
                  <li key={source.key}>
                    <span className="font-medium text-foreground">{source.label}</span> —{' '}
                    {HEALTH_LABELS[source.level].toLowerCase()}
                    {source.error ? ` : ${source.error}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="section-hebergement" className="space-y-4">
        <h2 id="section-hebergement" className="text-lg font-semibold tracking-tight">
          Hébergement et environnement
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <h3 className="text-base font-semibold">Hébergement Coolify</h3>
                <p className="text-sm text-muted-foreground">
                  Joignabilité, version, latence et serveurs déclarés. Le jeton d’API n’est jamais affiché.
                </p>
              </div>
              <LevelBadge level={src('coolify').level} />
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <DataRow label="Configuration">
                  {snapshot.coolify.configured ? 'COOLIFY_API_URL et COOLIFY_API_TOKEN définis' : 'Variables absentes'}
                </DataRow>
                <DataRow label="Joignable">{snapshot.coolify.reachable ? 'Oui' : 'Non'}</DataRow>
                <DataRow label="Version">
                  {snapshot.coolify.version ?? (snapshot.coolify.configured ? 'non exposée' : '—')}
                </DataRow>
                <DataRow label="Latence">{formatLatency(snapshot.coolify.latencyMs)}</DataRow>
                <DataRow label="Dernière réponse">
                  {snapshot.coolify.lastResponseAt
                    ? dateTime.format(new Date(snapshot.coolify.lastResponseAt))
                    : 'Aucune réponse'}
                </DataRow>
                <DataRow label="Applications">
                  {snapshot.coolify.reachable ? number.format(snapshot.coolify.applications.length) : '—'}
                </DataRow>
              </dl>

              <SourceError source={src('coolify')} />

              {snapshot.coolify.servers.length > 0 ? (
                <details className="group rounded-xl border border-border bg-muted/20 p-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
                    <span>Serveurs déclarés ({number.format(snapshot.coolify.servers.length)})</span>
                    <span className="text-xs font-normal text-muted-foreground group-open:hidden">Afficher le détail</span>
                    <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Masquer le détail</span>
                  </summary>
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <ul className="space-y-3">
                      {snapshot.coolify.servers.map((server) => (
                        <li key={server.uuid} className="rounded-xl border border-border bg-background p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                              {server.name}
                              {server.ip && (
                                <span className="ml-2 font-mono text-xs text-muted-foreground">{server.ip}</span>
                              )}
                            </p>
                            <LevelBadge level={serverLevel(server.reachable)} />
                          </div>
                          <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
                            <DataRow label="Rôle">{server.role ?? '—'}</DataRow>
                            <DataRow label="Docker">{server.dockerVersion ?? 'non exposé'}</DataRow>
                            <DataRow label="Applications">
                              {server.applications === null ? '—' : number.format(server.applications)}
                            </DataRow>
                            <DataRow label="Bases de données">
                              {server.databases === null ? '—' : number.format(server.databases)}
                            </DataRow>
                            <DataRow label="CPU">
                              {server.metrics.cpu === null ? 'Non exposé par l’API' : `${server.metrics.cpu} %`}
                            </DataRow>
                            <DataRow label="Mémoire">
                              {server.metrics.memory === null ? 'Non exposé par l’API' : `${server.metrics.memory} %`}
                            </DataRow>
                            <DataRow label="Disque">
                              {server.metrics.disk === null ? 'Non exposé par l’API' : `${server.metrics.disk} %`}
                            </DataRow>
                            <DataRow label="Charge mesurée">
                              {server.metricsLevel === 'unknown' ? 'Indisponible' : HEALTH_LABELS[server.metricsLevel]}
                            </DataRow>
                          </dl>
                          {server.metrics.disk !== null && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Seuils d’alerte : {METRICS_WARNING_PERCENT} % (à surveiller), {METRICS_DANGER_PERCENT} % (critique).
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Coolify n’expose pas les relevés CPU/mémoire/disque dans son API de liste (ils passent par Sentinel) :
                      « non exposé par l’API » n’est pas une panne.
                    </p>
                  </div>
                </details>
              ) : (
                snapshot.coolify.reachable && (
                  <p className="text-sm text-muted-foreground">Aucun serveur déclaré côté hébergement.</p>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <h3 className="text-base font-semibold">Applications sans projet</h3>
                <p className="text-sm text-muted-foreground">
                  Présentes côté Coolify, liées à aucun projet EFLEX : conteneurs oubliés à nettoyer.
                </p>
              </div>
              <LevelBadge
                level={snapshot.projects.error ? 'unknown' : snapshot.projects.orphans.length > 0 ? 'warning' : 'ok'}
              />
            </CardHeader>
            <CardContent>
              {snapshot.projects.error ? (
                <p
                  role="status"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  Projets indisponibles : {snapshot.projects.error}
                </p>
              ) : snapshot.projects.orphans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune application orpheline détectée parmi {number.format(snapshot.projects.total)} projet
                  {snapshot.projects.total > 1 ? 's' : ''}.
                </p>
              ) : (
                <ul className="space-y-2">
                  {snapshot.projects.orphans.slice(0, 20).map((application) => (
                    <li
                      key={application.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-b-0 last:pb-0"
                    >
                      <span className="font-medium">{application.name}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {application.status ?? 'statut inconnu'} · {application.id}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {snapshot.projects.orphans.length > 20 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {number.format(snapshot.projects.orphans.length - 20)} autre
                  {snapshot.projects.orphans.length - 20 > 1 ? 's' : ''} application
                  {snapshot.projects.orphans.length - 20 > 1 ? 's' : ''} non affichée
                  {snapshot.projects.orphans.length - 20 > 1 ? 's' : ''}.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <h3 className="text-base font-semibold">Base de données</h3>
                <p className="text-sm text-muted-foreground">
                  Taille et connexions PostgreSQL du portail (via <code className="font-mono text-xs">pg_stat_activity</code>).
                </p>
              </div>
              <LevelBadge level={src('database').level} />
            </CardHeader>
            <CardContent>
              <dl>
                <DataRow label="Taille">
                  {snapshot.database.sizeBytes === null ? '—' : formatBytes(snapshot.database.sizeBytes)}
                </DataRow>
                <DataRow label="Connexions">
                  {snapshot.database.connections === null
                    ? '—'
                    : `${
                        snapshot.database.maxConnections === null
                          ? number.format(snapshot.database.connections)
                          : `${number.format(snapshot.database.connections)} / ${number.format(snapshot.database.maxConnections)}`
                      }`}
                </DataRow>
                <DataRow label="Actives / inactives">
                  {snapshot.database.connections === null
                    ? '—'
                    : `${number.format(snapshot.database.activeConnections ?? 0)} / ${number.format(
                        snapshot.database.idleConnections ?? 0,
                      )}`}
                </DataRow>
                <DataRow label="Latence de la sonde">{formatLatency(snapshot.database.latencyMs)}</DataRow>
              </dl>
              <SourceError source={src('database')} />
              <p className="mt-3 text-xs text-muted-foreground">
                Seuils d’alerte : {CONNECTION_WARNING_RATIO * 100} % des connexions autorisées (à surveiller),{' '}
                {CONNECTION_DANGER_RATIO * 100} % (critique). L’URL de connexion n’est jamais affichée.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="section-exploitation" className="space-y-4">
        <h2 id="section-exploitation" className="text-lg font-semibold tracking-tight">
          Déploiements, file et certificats
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <h3 className="text-base font-semibold">Déploiements</h3>
                <p className="text-sm text-muted-foreground">
                  Répartition par état et déploiements bloqués au-delà de {snapshot.deployments.timeoutMinutes} minutes.
                </p>
              </div>
              <LevelBadge level={src('deployments').level} />
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm tabular-nums text-muted-foreground">
                {number.format(snapshot.deployments.summary.total)} déploiement
                {snapshot.deployments.summary.total > 1 ? 's' : ''} enregistré
                {snapshot.deployments.summary.total > 1 ? 's' : ''} ·{' '}
                {number.format(snapshot.deployments.summary.active)} en cours
              </p>
              <dl>
                {Object.entries(snapshot.deployments.summary.byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <DataRow key={status} label={isDeploymentStatus(status) ? STATUS_LABELS[status] : status}>
                      {number.format(count)}
                    </DataRow>
                  ))}
              </dl>
              {snapshot.deployments.stale > 0 ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {number.format(snapshot.deployments.stale)} déploiement
                  {snapshot.deployments.stale > 1 ? 's' : ''} non terminé
                  {snapshot.deployments.stale > 1 ? 's' : ''} depuis plus de {snapshot.deployments.timeoutMinutes} minutes
                  : le worker ou Coolify est probablement bloqué.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                  Aucun déploiement bloqué au-delà du délai du chien de garde.
                </p>
              )}
              <SourceError source={src('deployments')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <h3 className="text-base font-semibold">File de déploiements</h3>
                <p className="text-sm text-muted-foreground">File BullMQ sur Redis (jobs en attente, actifs, échoués).</p>
              </div>
              <LevelBadge level={src('queue').level} />
            </CardHeader>
            <CardContent>
              {snapshot.queue.counts ? (
                <dl>
                  <DataRow label="En attente">{number.format(snapshot.queue.counts.waiting)}</DataRow>
                  <DataRow label="En cours">{number.format(snapshot.queue.counts.active)}</DataRow>
                  <DataRow label="Différés (en retard)">{number.format(snapshot.queue.counts.delayed)}</DataRow>
                  <DataRow label="Échoués (BullMQ)">{number.format(snapshot.queue.counts.failed)}</DataRow>
                  <DataRow label="Terminés">{number.format(snapshot.queue.counts.completed)}</DataRow>
                  <DataRow label="En pause">{number.format(snapshot.queue.counts.paused)}</DataRow>
                  <DataRow label="Latence de la sonde">{formatLatency(snapshot.queue.latencyMs)}</DataRow>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Compteurs indisponibles.</p>
              )}
              {snapshot.queue.counts && snapshot.queue.counts.delayed > 0 && (
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground"
                >
                  {number.format(snapshot.queue.counts.delayed)} job{snapshot.queue.counts.delayed > 1 ? 's' : ''} différé
                  {snapshot.queue.counts.delayed > 1 ? 's' : ''} : traitement reporté (nouvelle tentative ou délai
                  programmé). Une accumulation durable peut signaler un worker ralenti ou des erreurs répétées.
                </p>
              )}
              {snapshot.queue.counts && snapshot.queue.counts.failed > 0 && (
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {number.format(snapshot.queue.counts.failed)} job{snapshot.queue.counts.failed > 1 ? 's' : ''} en échec
                  côté file BullMQ (après tentatives). Consultez les déploiements concernés et les journaux du worker.
                </p>
              )}
              <SourceError source={src('queue')} />
              <p className="mt-3 text-xs text-muted-foreground">
                Indicateur « jobs en attente » : alerte à partir de 10 (à surveiller) puis 50 (critique). Les jobs «
                différés » sont des exécutions retardées, pas forcément bloquées si le nombre ne croît pas.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <h3 className="text-base font-semibold">Certificats TLS</h3>
                <p className="text-sm text-muted-foreground">
                  Expiration dans les {CERT_WARNING_DAYS} jours, d’après le dernier contrôle TLS de chaque déploiement.
                </p>
              </div>
              <LevelBadge level={snapshot.certificates.level} />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm tabular-nums text-muted-foreground">
                {number.format(snapshot.certificates.total)} certificat
                {snapshot.certificates.total > 1 ? 's' : ''} suivi
                {snapshot.certificates.total > 1 ? 's' : ''} · {snapshot.certificates.expired} expiré
                {snapshot.certificates.expired > 1 ? 's' : ''} · {snapshot.certificates.critical} critique
                {snapshot.certificates.critical > 1 ? 's' : ''} (≤ 7 j) · {snapshot.certificates.warning} à surveiller (≤
                30 j)
              </p>

              {snapshot.certificates.error ? (
                <SourceError source={src('certificates')} />
              ) : snapshot.certificates.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun certificat TLS suivi pour l’instant : ils sont enregistrés après chaque déploiement.
                </p>
              ) : snapshot.certificates.soon.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun certificat n’expire dans les 30 prochains jours.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Certificats les plus proches de l’expiration</caption>
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Hôte
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Projet
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Expiration
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          État
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {snapshot.certificates.soon.map((item) => (
                        <tr key={`${item.kind}-${item.id}`}>
                          <th scope="row" className="py-2 pr-3 text-left font-medium">
                            {item.hostname}
                          </th>
                          <td className="py-2 pr-3 text-muted-foreground">{item.projectName ?? '—'}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {item.expiresAt ? dateOnly.format(new Date(item.expiresAt)) : '—'}
                          </td>
                          <td className="py-2">
                            <LevelBadge level={item.risk.level} />
                            <span className="ml-2 text-xs text-muted-foreground">{item.risk.label}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="section-reglages" className="space-y-4">
        <h2 id="section-reglages" className="text-lg font-semibold tracking-tight">
          Réglages de la plateforme
        </h2>
        <Card id="reglages">
          <CardHeader className="pb-2">
            <h3 className="text-base font-semibold">Configuration et diffusion</h3>
            <p className="text-sm text-muted-foreground">
              Modifications appliquées immédiatement, sans redéploiement, et enregistrées dans le journal d’audit.
              {snapshot.settings.maintenanceForced && (
                <span className="mt-1 block font-medium text-warning">
                  MAINTENANCE_MODE=true est défini sur le conteneur : la maintenance ne peut pas être désactivée ici.
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent>
            <InfrastructureSettingsForm
              initial={snapshot.settings.settings}
              maintenanceForced={snapshot.settings.maintenanceForced}
              source={snapshot.settings.source}
              maxMaintenanceMessage={MAX_MAINTENANCE_MESSAGE}
              maxAnnouncement={MAX_ANNOUNCEMENT}
            />
            {snapshot.settings.error && (
              <p
                role="status"
                className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                Réglages lus depuis l’environnement : {snapshot.settings.error}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="section-sources" className="space-y-4">
        <h2 id="section-sources" className="text-lg font-semibold tracking-tight">
          Détail des sources
        </h2>
        <details className="group rounded-2xl border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
            <span>État de chaque source de supervision ({number.format(snapshot.sources.length)})</span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">Afficher</span>
            <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Masquer</span>
          </summary>
          <div className="border-t border-border px-4 pb-4">
            <p className="py-3 text-sm text-muted-foreground">
              Chaque source est interrogée indépendamment avec un délai court.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">État de chaque source de supervision</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Source
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      État
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Latence
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Détail
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snapshot.sources.map((source) => (
                    <tr key={source.key}>
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        {source.label}
                      </th>
                      <td className="py-2 pr-3">
                        <LevelBadge level={source.level} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{formatLatency(source.latencyMs)}</td>
                      <td className="py-2 text-muted-foreground">
                        {source.error ?? (
                          <time dateTime={source.checkedAt}>{dateTime.format(new Date(source.checkedAt))}</time>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </section>
    </div>
  )
}
