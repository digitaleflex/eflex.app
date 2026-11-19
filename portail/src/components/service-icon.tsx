import type { CSSProperties } from 'react'
import * as simpleIcons from 'simple-icons'

type IconData = { title: string; path: string; hex: string }

const ICONS: Record<string, IconData | undefined> = {
  postgresql: simpleIcons.siPostgresql,
  postgres: simpleIcons.siPostgresql,
  redis: simpleIcons.siRedis,
  mysql: simpleIcons.siMysql,
  mariadb: simpleIcons.siMariadb,
  mongodb: simpleIcons.siMongodb,
  mongo: simpleIcons.siMongodb,
  clickhouse: simpleIcons.siClickhouse,
  sqlite: simpleIcons.siSqlite,
  dragonfly: undefined, // pas dans simple-icons
  keydb: undefined, // pas dans simple-icons
  minio: simpleIcons.siMinio,
  meilisearch: simpleIcons.siMeilisearch,
  rabbitmq: simpleIcons.siRabbitmq,
  nats: simpleIcons.siNatsdotio,
  qdrant: simpleIcons.siQdrant,
  elasticsearch: simpleIcons.siElasticsearch,
  opensearch: simpleIcons.siOpensearch,
  grafana: simpleIcons.siGrafana,
  prometheus: simpleIcons.siPrometheus,
  supabase: simpleIcons.siSupabase,
  appwrite: simpleIcons.siAppwrite,
  pocketbase: simpleIcons.siPocketbase,
  kafka: simpleIcons.siApachekafka,
  typesense: undefined,
}

const FALLBACK_COLORS: Record<string, string> = {
  dragonfly: 'D9272E',
  keydb: 'D82C20',
  typesense: '2B2D42',
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return '100 116 139'
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

/** Icône de service/base (logos de marque via simple-icons), avec repli. */
export function ServiceIcon({
  kind,
  className = 'h-5 w-5',
  label,
}: {
  kind: string
  className?: string
  label?: string
}) {
  const icon = ICONS[kind]
  const hex = icon?.hex ?? FALLBACK_COLORS[kind] ?? '64748B'
  const rgb = hexToRgb(hex)

  if (!icon) {
    const initials = (label ?? kind).slice(0, 2).toUpperCase()
    return (
      <span
        aria-hidden="true"
        style={{ '--brand-rgb': rgb } as CSSProperties}
        className={`service-icon inline-flex shrink-0 items-center justify-center rounded-md text-xs font-bold ${className}`}
      >
        {initials}
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      title={label ?? icon.title}
      style={{ '--brand-rgb': rgb } as CSSProperties}
      className={`service-icon inline-flex shrink-0 items-center justify-center rounded-md ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="currentColor" role="img" focusable="false">
        <path d={icon.path} />
      </svg>
    </span>
  )
}
