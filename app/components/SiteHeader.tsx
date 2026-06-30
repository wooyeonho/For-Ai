"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LanguageSelector } from "./LanguageSelector";
import { DEFAULT_LOCALE, isValidLocale } from "../../lib/i18n";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const locale = firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
  const localeHome = `/${locale}`;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={localeHome} className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href={`${localeHome}#registry`}>Registry</Link>
          <Link href="/api-docs">API</Link>
          <Link href="/community">Community</Link>
          <Link href="/contribute">Contribute</Link>
          <Link href="/suggest-topic">Suggest</Link>
          <LanguageSelector />
        </nav>
        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav-toggle-bar" aria-hidden="true" />
          <span className="nav-toggle-bar" aria-hidden="true" />
          <span className="nav-toggle-bar" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <nav className="site-nav-mobile" aria-label="Mobile menu">
          <Link href={`${localeHome}#registry`} onClick={close}>Registry</Link>
          <Link href="/api-docs" onClick={close}>API</Link>
          <Link href="/community" onClick={close}>Community</Link>
          <Link href="/contribute" onClick={close}>Contribute</Link>
          <Link href="/suggest-topic" onClick={close}>Suggest Topic</Link>
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
