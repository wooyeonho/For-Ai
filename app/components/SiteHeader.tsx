"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const locale = firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
  const dir = LOCALE_CONFIG[locale].dir;
  const chromeClassName = `site-header site-chrome site-chrome-${dir}`;
  const close = () => setOpen(false);

  return (
    <header className={chromeClassName} lang={locale} dir={dir}>
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href="/#registry">Registry</Link>
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
          <Link href="/#registry" onClick={close}>Registry</Link>
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
