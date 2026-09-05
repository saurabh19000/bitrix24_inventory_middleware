import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@system.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@123456',
  BITRIX_ENCRYPTION_KEY: process.env.BITRIX_ENCRYPTION_KEY || 'default-key-change-me!!',
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  BITRIX_CONCURRENCY: parseInt(process.env.BITRIX_CONCURRENCY || '5', 10),
  BITRIX_MAX_RETRIES: parseInt(process.env.BITRIX_MAX_RETRIES || '3', 10),
  BITRIX_REQUEST_TIMEOUT: parseInt(process.env.BITRIX_REQUEST_TIMEOUT || '30000', 10),
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '50', 10),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
  COOKIE_SECURE: (process.env.COOKIE_SECURE || (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',
  UPLOAD_DIR: path.resolve(__dirname, '../../uploads'),
};

const required = ['DATABASE_URL', 'JWT_SECRET', 'BITRIX_ENCRYPTION_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}