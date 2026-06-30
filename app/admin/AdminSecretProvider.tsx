"use client";

import type { CSSProperties } from "react";
import { useCallback, useState } from "react";

type AdminLoginState = "idle" | "loading" | "authenticated" | "error";

export function useAdminSecret() {
  const [adminSecret, setAdminSecretState] = useState("");
  const [status, setStatus] = useState<AdminLoginState>("idle");
  const [message, setMessage] = useState("");

  const setAdminSecret = useCallback((value: string) => {
    setAdminSecretState(value);
    if (status === "error") {
      setStatus("idle");
      setMessage("");
    }
  }, [status]);

  const resetAdminSecret = useCallback(() => {
    setAdminSecretState("");
    setStatus("idle");
    setMessage("");
  }, []);

  const login = useCallback(async () => {
    if (!adminSecret) {
      setStatus("error");
      setMessage("ADMIN_SECRET을 입력하세요.");
      return false;
    }
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminSecret }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(typeof payload.error === "string" ? payload.error : "관리자 로그인에 실패했습니다.");
        return false;
      }
      setAdminSecretState("");
      setStatus("authenticated");
      setMessage("관리자 세션이 생성되었습니다.");
      window.dispatchEvent(new Event("admin-session-change"));
      return true;
    } catch {
      setStatus("error");
      setMessage("네트워크 오류로 로그인하지 못했습니다.");
      return false;
    }
  }, [adminSecret]);

  return { adminSecret, setAdminSecret, resetAdminSecret, login, status, message };
}

export function AdminSecretField({
  adminSecret,
  setAdminSecret,
  resetAdminSecret,
  login,
  status = "idle",
  message = "",
  label = "Admin Login",
  placeholder = "ADMIN_SECRET",
  inputStyle,
}: {
  adminSecret: string;
  setAdminSecret: (value: string) => void;
  resetAdminSecret: () => void;
  login?: () => Promise<boolean>;
  status?: AdminLoginState;
  message?: string;
  label?: string;
  placeholder?: string;
  inputStyle?: CSSProperties;
}) {
  const loading = status === "loading";
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 600, fontSize: 13 }}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="password"
          value={adminSecret}
          onChange={(event) => setAdminSecret(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void login?.(); }}
          placeholder={placeholder}
          style={inputStyle ?? { flex: 1, padding: 8 }}
        />
        <button type="button" onClick={() => void login?.()} disabled={loading || !adminSecret} style={{ padding: "8px 12px", border: 0, borderRadius: 6, background: "#111827", color: "#fff", fontSize: 12, cursor: loading || !adminSecret ? "not-allowed" : "pointer" }}>
          {loading ? "로그인 중..." : "세션 로그인"}
        </button>
        <button type="button" onClick={resetAdminSecret} disabled={!adminSecret} style={{ padding: "8px 12px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", fontSize: 12, cursor: adminSecret ? "pointer" : "not-allowed" }}>
          입력 지우기
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
        ADMIN_SECRET은 /api/admin/login에만 전송되며 저장하지 않습니다. 이후 admin API는 httpOnly session cookie로 인증합니다.
      </p>
      {message && <p style={{ margin: 0, fontSize: 12, color: status === "error" ? "#991b1b" : "#166534" }}>{message}</p>}
    </div>
  );
}
