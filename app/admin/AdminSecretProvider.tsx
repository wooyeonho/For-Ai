"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

const ADMIN_SECRET_STORAGE_KEY = "for-ai-admin-secret";

export function useAdminSecret() {
  const [adminSecret, setAdminSecretState] = useState("");

  useEffect(() => {
    setAdminSecretState(sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY) ?? "");
  }, []);

  const setAdminSecret = useCallback((value: string) => {
    setAdminSecretState(value);
    if (value) {
      sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, value);
    } else {
      sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    }
    window.dispatchEvent(new Event("admin-secret-change"));
  }, []);

  const resetAdminSecret = useCallback(() => {
    setAdminSecret("");
  }, [setAdminSecret]);

  useEffect(() => {
    function handleSecretChange() {
      setAdminSecretState(sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY) ?? "");
    }

    window.addEventListener("storage", handleSecretChange);
    window.addEventListener("admin-secret-change", handleSecretChange);
    return () => {
      window.removeEventListener("storage", handleSecretChange);
      window.removeEventListener("admin-secret-change", handleSecretChange);
    };
  }, []);

  return { adminSecret, setAdminSecret, resetAdminSecret };
}

export function AdminSecretField({
  adminSecret,
  setAdminSecret,
  resetAdminSecret,
  label = "Admin Secret",
  placeholder = "ADMIN_SECRET",
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
          style={inputStyle ?? { flex: 1, padding: 8 }}
        />
        <button
          type="button"
          onClick={resetAdminSecret}
          disabled={!adminSecret}
          style={{ padding: "8px 12px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", fontSize: 12, cursor: adminSecret ? "pointer" : "not-allowed" }}
        >
          관리자 키 초기화
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
        브라우저 세션에만 저장됩니다. 로그아웃/초기화 버튼으로 삭제할 수 있습니다.
      </p>
    </div>
  );
}
