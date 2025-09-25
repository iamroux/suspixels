import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: process.env.APP_PORT || '3002',
  title: process.env.APP_TITLE || 'Suspixels',
  description:
    process.env.APP_DESCRIPTION || 'A pixel art game engine for the web',
  version: process.env.APP_VERSION || '1.0.0',
  corsOrigins: (process.env.APP_CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0),
}));
