export interface AppConfig {
  port: number;
  databaseUrl: string;
  natsUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  internalApiKey: string;
  adminEmail: string;
  adminInitialPassword: string;
  jellyfinUrl: string;
  jellyfinApiKey: string;
}

const REQUIRED_VARS = [
  'DATABASE_URL',
  'NATS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'INTERNAL_API_KEY',
  'ADMIN_EMAIL',
  'ADMIN_INITIAL_PASSWORD',
] as const;

export function loadConfig(): AppConfig {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL as string,
    natsUrl: process.env.NATS_URL as string,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
    internalApiKey: process.env.INTERNAL_API_KEY as string,
    adminEmail: process.env.ADMIN_EMAIL as string,
    adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD as string,
    jellyfinUrl: process.env.JELLYFIN_URL ?? '',
    jellyfinApiKey: process.env.JELLYFIN_API_KEY ?? '',
  };
}
