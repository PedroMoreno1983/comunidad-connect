import { z } from "zod";

const databaseUrlSchema = z.string().refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("file:"),
  {
    message: 'Invalid string: must start with "postgresql://" or "file:"',
  },
);

const envSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("DataWise People Analytics"),
  BASIC_AUTH_USERNAME: z.string().min(1).optional(),
  BASIC_AUTH_PASSWORD: z.string().min(1).optional(),
});

export function getEnvStatus() {
  return envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME,
    BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD,
  });
}

export function getValidatedEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME,
    BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD,
  });
}
