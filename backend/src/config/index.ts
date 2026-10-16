import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load from backend .env or root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // PostgreSQL
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/reachinbox_scheduler?schema=public'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // BullMQ Worker
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  DEFAULT_JOB_ATTEMPTS: z.coerce.number().default(3),
  DEFAULT_BACKOFF_DELAY_MS: z.coerce.number().default(5000),

  // Rate Limiting & Delays
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(100),

  // Session & Security
  SESSION_SECRET: z.string().default('default_session_secret_reachinbox_32_characters_minimum!'),
  ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/api/auth/google/callback'),
  AUTH_BYPASS_DEV: z.string().transform((val) => val === 'true').default('false'),

  // Slack OAuth
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:5000/api/slack/callback'),
  SLACK_SIGNING_SECRET: z.string().optional().default(''),

  // Elasticsearch
  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  // Logging
  LOG_LEVEL: z.string().default('info'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid configuration environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
