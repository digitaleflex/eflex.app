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
  const hosts = (Array.isArray(domain) ? domain : [domain])
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  const hostRule = hosts.map((host) => `Host(\`${host}\`)`).join(' || ');

  const labels = [
    'traefik.enable=true',
    `traefik.docker.network=${network}`,
    `traefik.http.routers.${routerId}.rule=${hostRule}`,
    `traefik.http.routers.${routerId}.entrypoints=${entrypoint}`,
    `traefik.http.routers.${routerId}.tls=true`,
    `traefik.http.routers.${routerId}.tls.certresolver=${certResolver}`,
    `traefik.http.services.${routerId}.loadbalancer.server.port=${port}`,
  ];

  if (traefik?.middlewares && traefik.middlewares.length > 0) {
    labels.push(`traefik.http.routers.${routerId}.middlewares=${traefik.middlewares.join(',')}`);
  }

  return labels;
}