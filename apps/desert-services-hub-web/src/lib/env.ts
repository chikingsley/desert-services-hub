import { z } from "zod";

const publicEnvSchema = z.object({
  BASE_URL: z.string(),
  DEV: z.boolean(),
  MODE: z.string().min(1),
  PROD: z.boolean(),
});

export const publicEnv = publicEnvSchema.parse({
  BASE_URL: import.meta.env.BASE_URL,
  DEV: import.meta.env.DEV,
  MODE: import.meta.env.MODE,
  PROD: import.meta.env.PROD,
});

export const apiBasePath = "/api";
