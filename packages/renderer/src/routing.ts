export function traefikLabels(
  projectId: string,
  serviceName: string,
  domain: string,
  port: number,
  network: string,
  traefik?: { entrypoint?: string; certResolver?: string; middlewares?: string[] },
): string[] {
  const entrypoint = traefik?.entrypoint ?? 'websecure';
  const certResolver = traefik?.certResolver ?? 'letsencrypt';
  const routerId = `${projectId}-${serviceName}`;

  const labels = [
    'traefik.enable=true',
    `traefik.docker.network=${network}`,
    `traefik.http.routers.${routerId}.rule=Host(\`${domain}\`)`,
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