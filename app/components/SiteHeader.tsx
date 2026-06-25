"use client";
import { useState } from "react";
import Link from "next/link";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href="/#registry">문서</Link>
          <Link href="/community">커뮤니티</Link>
          <Link href="/suggest-topic">제안</Link>
          <LanguageSelector />
        </nav>
        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>
      </div>
      {open && (
        <nav className="site-nav-mobile" aria-label="Mobile menu">
          <Link href="/#registry" onClick={close}>문서</Link>
          <Link href="/community" onClick={close}>커뮤니티</Link>
          <Link href="/suggest-topic" onClick={close}>제안</Link>
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
