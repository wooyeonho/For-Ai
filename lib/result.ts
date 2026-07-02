export type Result<T> =
  | { ok: true; data: T; error?: never; status?: number }
  | { ok: false; data?: never; error: string; status: number; code?: string; detail?: unknown };

export function ok<T>(data: T, status = 200): Result<T> {
  return { ok: true, data, status };
}

export function err(error: string, status = 500, extra?: { code?: string; detail?: unknown }): Result<never> {
  return { ok: false, error, status, ...extra };
}
