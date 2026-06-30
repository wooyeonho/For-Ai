export type AdminErrorPayload = {
  error?: unknown;
  action?: unknown;
};

export function formatAdminError(payload: AdminErrorPayload, fallback: string): string {
  if (payload.error === "operation_failed" && typeof payload.action === "string") {
    return `작업 실패 (${payload.action}). 서버 로그 확인 후 다시 시도해 주세요.`;
  }
  return typeof payload.error === "string" ? payload.error : fallback;
}
