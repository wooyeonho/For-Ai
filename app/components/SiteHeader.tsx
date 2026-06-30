"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, isValidLocale } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import { LanguageSelector } from "./LanguageSelector";

function getLocaleFromPathname(pathname: string): SupportedLocale | null {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return firstSegment && isValidLocale(firstSegment) ? firstSegment : null;
}

function getBrowserPreferredLocale(): SupportedLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  for (const language of navigator.languages ?? [navigator.language]) {
    const locale = language.toLowerCase().split("-")[0];
    if (isValidLocale(locale)) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}

export function SiteHeader() {
  const pathname = usePathname();
  const pathnameLocale = getLocaleFromPathname(pathname);
  const [fallbackLocale, setFallbackLocale] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const activeLocale = pathnameLocale ?? fallbackLocale;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!pathnameLocale) {
      setFallbackLocale(getBrowserPreferredLocale());
    }
  }, [pathnameLocale]);

  const registryHref = `/${activeLocale}#registry`;
  const communityHref = `/community?lang=${activeLocale}`;
  const suggestHref = `/suggest-topic?lang=${activeLocale}`;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={`/${activeLocale}`} className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href={registryHref}>Registry</Link>
          <Link href="/api-docs">API</Link>
          <Link href={communityHref}>Community</Link>
          <Link href="/contribute">Contribute</Link>
          <Link href={suggestHref}>Suggest</Link>
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
          <Link href={registryHref} onClick={close}>Registry</Link>
          <Link href="/api-docs" onClick={close}>API</Link>
          <Link href={communityHref} onClick={close}>Community</Link>
          <Link href="/contribute" onClick={close}>Contribute</Link>
          <Link href={suggestHref} onClick={close}>Suggest Topic</Link>
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
