"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getCurrentLocaleFromPath, localizedPath, withLangQuery } from "../../lib/i18n/routing";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = getCurrentLocaleFromPath(pathname);
  const close = () => setOpen(false);
  const pageLink = (path: string) => localizedPath(locale, path) === path ? withLangQuery(locale, path) : localizedPath(locale, path);
  const formLink = (path: string) => withLangQuery(locale, path);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={localizedPath(locale, "/")} className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href={pageLink("/#registry")}>Registry</Link>
          <Link href={pageLink("/api-docs")}>API</Link>
          <Link href={pageLink("/community")}>Community</Link>
          <Link href={pageLink("/contribute")}>Contribute</Link>
          <Link href={formLink("/suggest-topic")}>Suggest</Link>
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
          <Link href={pageLink("/#registry")} onClick={close}>Registry</Link>
          <Link href={pageLink("/api-docs")} onClick={close}>API</Link>
          <Link href={pageLink("/community")} onClick={close}>Community</Link>
          <Link href={pageLink("/contribute")} onClick={close}>Contribute</Link>
          <Link href={formLink("/suggest-topic")} onClick={close}>Suggest Topic</Link>
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
