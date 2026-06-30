"use client";

import type { CSSProperties } from "react";
import { useCallback, useState } from "react";

export function useAdminSecret() {
  const [adminSecret, setAdminSecretState] = useState("");

  const setAdminSecret = useCallback((value: string) => {
    setAdminSecretState(value);
  }, []);

  const resetAdminSecret = useCallback(() => {
    setAdminSecret("");
  }, [setAdminSecret]);

  return { adminSecret, setAdminSecret, resetAdminSecret };
}

export function AdminSecretField({
  adminSecret,
  setAdminSecret,
  resetAdminSecret,
  label = "Admin Password",
  placeholder = "Admin password",
  inputStyle,
}: {
  adminSecret: string;
  setAdminSecret: (value: string) => void;
  resetAdminSecret: () => void;
  label?: string;
  placeholder?: string;
  inputStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 600, fontSize: 13 }}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="password"
          value={adminSecret}
          onChange={(event) => setAdminSecret(event.target.value)}
          placeholder={placeholder}
          autoComplete="current-password"
          style={inputStyle ?? { flex: 1, padding: 8 }}
        />
        <button
          type="button"
          onClick={resetAdminSecret}
          disabled={!adminSecret}
          style={{ padding: "8px 12px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", fontSize: 12, cursor: adminSecret ? "pointer" : "not-allowed" }}
        >
          입력 지우기
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
        비밀번호는 브라우저 저장소에 저장하지 않습니다. 로그인 성공 후 httpOnly cookie로 인증됩니다.
      </p>
    </div>
  );
}
