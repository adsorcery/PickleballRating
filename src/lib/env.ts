import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_PATH: z.string().min(1).default("./data/viet-cinco.sqlite"),
  APP_TIMEZONE: z
    .string()
    .default("America/Los_Angeles")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "APP_TIMEZONE must be a valid IANA timezone"),
  ADMIN_BOOTSTRAP_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  ADMIN_BOOTSTRAP_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(12).optional()),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  BACKUP_INTERVAL_HOURS: z.coerce.number().min(0).default(24),
  BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).default(14),
  BACKUP_S3_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
  BACKUP_S3_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),
  BACKUP_S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  BACKUP_S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  BACKUP_S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  BACKUP_S3_PREFIX: z.preprocess(emptyToUndefined, z.string().default("viet-cinco/")),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Lazily validated so `next build` (which has no disk or secrets) never fails on env. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}
