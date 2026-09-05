import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  redact: {
    paths: ['password', 'passwordHash', 'webhookUrl', 'webhookUrlEncrypted', 'token', 'secret'],
    censor: '[REDACTED]',
  },
  base: { pid: process.pid, service: 'bitrix-inventory-middleware' },
});