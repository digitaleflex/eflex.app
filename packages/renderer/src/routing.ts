function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeMiddlewareId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'host';
}

/** Quand les deux variantes sont présentes, redirige `www.hôte` vers `hôte` (HTTPS). */
function apexRedirectMiddlewares(routerId: string, hosts: readonly string[]): { names: string[]; labels: string[] } {
  const set = new Set(hosts.map((h) => h.toLowerCase()));
  const names: string[] = [];
  const labels: string[] = [];
  for (const host of hosts) {
    const lower = host.toLowerCase();
    if (!lower.startsWith('www.')) continue;
    const apex = lower.slice(4);
    if (!apex || !set.has(apex)) continue;
    const name = `${routerId}-redir-${safeMiddlewareId(apex)}`;
    names.push(name);
    labels.push(
      `traefik.http.middlewares.${name}.redirectregex.regex=^https?://${escapeRegex(lower)}/(.*)`,
      `traefik.http.middlewares.${name}.redirectregex.replacement=https://${apex}/\${1}`,
      `traefik.http.middlewares.${name}.redirectregex.permanent=true`,
    );
  }
  return { names, labels };
}

export function traefikLabels(
  projectId: string,
  serviceName: string,
  domain: string | readonly string[],
  port: number,
  network: string,
  traefik?: { entrypoint?: string; certResolver?: string; middlewares?: string[] },
): string[] {
  const entrypoint = traefik?.entrypoint ?? 'websecure';
  const certResolver = traefik?.certResolver ?? 'letsencrypt';
  const routerId = `${projectId}-${serviceName}`;
  const hosts = [...new Set((Array.isArray(domain) ? domain : [domain]).map((host) => host.trim()).filter((host) => host.length > 0))];
  const hostRule = hosts.map((host) => `Host(\`${host}\`)`).join(' || ');

  const redirect = apexRedirectMiddlewares(routerId, hosts);
  const middlewares = [...redirect.names, ...(traefik?.middlewares ?? [])];

  const labels = [
    'traefik.enable=true',
    `traefik.docker.network=${network}`,
    `traefik.http.routers.${routerId}.rule=${hostRule}`,
    `traefik.http.routers.${routerId}.entrypoints=${entrypoint}`,
    `traefik.http.routers.${routerId}.tls=true`,
    `traefik.http.routers.${routerId}.tls.certresolver=${certResolver}`,
    `traefik.http.services.${routerId}.loadbalancer.server.port=${port}`,
    ...redirect.labels,
  ];

  if (middlewares.length > 0) {
    labels.push(`traefik.http.routers.${routerId}.middlewares=${middlewares.join(',')}`);
  }

  return labels;
}