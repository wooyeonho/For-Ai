"use client";
import { readAdminCsrfToken } from "@/lib/admin-client";

import type { CSSProperties } from "react";
import { useCallback, useState } from "react";

export function useAdminSecret() {
  const [adminSecret, setAdminSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const resetAdminSecret = useCallback(() => {
    setAdminSecret("");
  }, []);

  const loginAdmin = useCallback(async () => {
    if (!adminSecret) {
      setAuthMessage("관리자 키를 입력하세요.");
      return false;
    }
    setAuthMessage(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-csrf": "1" },
        body: JSON.stringify({ password: adminSecret }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setAuthMessage(payload.error ?? "관리자 로그인 실패");
        return false;
      }
      setAuthenticated(true);
      setAuthMessage("로그인되었습니다.");
      resetAdminSecret();
      return true;
    } catch {
      setAuthMessage("네트워크 오류");
      return false;
    }
  }, [adminSecret, resetAdminSecret]);

  return { adminSecret, setAdminSecret, resetAdminSecret, loginAdmin, authenticated, authMessage };
}

export function AdminSecretField({
  adminSecret,
  setAdminSecret,
  resetAdminSecret,
  loginAdmin,
  authMessage,
  label = "Admin Login",
  placeholder = "ADMIN_SECRET",
  inputStyle,
}: {
  adminSecret?: string;
  setAdminSecret?: (value: string) => void;
  resetAdminSecret?: () => void;
  value?: string;
  onChange?: (value: string) => void;
  onReset?: () => void;
  onSubmit?: () => Promise<void> | void;
  loading?: boolean;
  buttonLabel?: string;
  loginAdmin?: () => Promise<boolean>;
  authMessage?: string | null;
  label?: string;
  placeholder?: string;
  inputStyle?: CSSProperties;
}) {
  const currentSecret = adminSecret ?? value ?? "";
  const updateSecret = setAdminSecret ?? onChange ?? (() => undefined);
  const resetSecret = resetAdminSecret ?? onReset ?? (() => undefined);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const isLoading = externalLoading ?? loading;

  const login = useCallback(async () => {
    if (!currentSecret) {
      setStatus({ ok: false, text: "관리자 키를 입력하세요." });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-csrf": readAdminCsrfToken() },
        body: JSON.stringify({ password: currentSecret }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ ok: false, text: payload.error ?? "관리자 로그인 실패" });
        return;
      }
      resetSecret();
      setStatus({ ok: true, text: "로그인되었습니다. 이후 요청은 httpOnly cookie로 인증됩니다." });
    } catch {
      setStatus({ ok: false, text: "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }, [currentSecret, resetSecret]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 600, fontSize: 13 }}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="password"
          value={currentSecret}
          onChange={(event) => updateSecret(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void (onSubmit ?? loginAdmin ?? login)();
          }}
          placeholder={placeholder}
          style={inputStyle ?? { flex: 1, padding: 8 }}
        />
        <button type="button" onClick={() => void (onSubmit ?? login)()} disabled={isLoading || !currentSecret} style={{ padding: "8px 12px", border: 0, borderRadius: 6, background: "#111827", color: "#fff", fontSize: 12, cursor: isLoading || !currentSecret ? "not-allowed" : "pointer" }}>
          {isLoading ? "로그인 중" : (buttonLabel ?? "로그인")}
        </button>
      </div>
      {status && <p style={{ margin: 0, fontSize: 11, color: status.ok ? "#166534" : "#991b1b" }}>{status.text}</p>}
      <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
        관리자 키는 브라우저에 저장하지 않으며, 로그인 성공 후 httpOnly cookie로만 API를 호출합니다.
      </p>
      {authMessage && <p style={{ margin: 0, fontSize: 12, color: authMessage.includes("실패") ? "#991b1b" : "#166534" }}>{authMessage}</p>}
    </div>
  );
}
