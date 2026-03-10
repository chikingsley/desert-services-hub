export type EnvLike = Record<string, string | undefined>;

export function readPositiveIntEnv(
  key: string,
  fallback: number,
  env: EnvLike = process.env
): number {
  const raw = env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  return fallback;
}

export function taskQueue(
  name: string,
  envKey: string,
  defaultConcurrency: number
): { concurrencyLimit: number; name: string } {
  return {
    name,
    concurrencyLimit: readPositiveIntEnv(envKey, defaultConcurrency),
  };
}
