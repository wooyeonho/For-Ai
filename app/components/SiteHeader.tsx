"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_LOCALE, isValidLocale } from "../../lib/i18n";
import { LanguageSelector } from "./LanguageSelector";

function useCurrentLanguage(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const langParam = searchParams.get("lang");

  if (firstSegment && isValidLocale(firstSegment)) return firstSegment;
  if (langParam && isValidLocale(langParam)) return langParam;
  return DEFAULT_LOCALE;
}

function languageParamHref(pathname: string, lang: string): string {
  return `${pathname}?lang=${lang}`;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const currentLanguage = useCurrentLanguage();
  const close = () => setOpen(false);
  const communityHref = languageParamHref("/community", currentLanguage);
  const suggestHref = languageParamHref("/suggest-topic", currentLanguage);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href="/#registry">Registry</Link>
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
          <Link href="/#registry" onClick={close}>Registry</Link>
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
