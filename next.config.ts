import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone нужен для образа в docker-compose.prod.yml:
  // Next кладёт в .next/standalone минимальный сервер со своими зависимостями.
  output: 'standalone',
  // pg тянет нативные опциональные зависимости, которые бандлить не нужно.
  serverExternalPackages: ['pg'],
};

export default nextConfig;
