"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LanguageSelector, getCurrentLocale } from "./LanguageSelector";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [browserLocale, setBrowserLocale] = useState<string | null>(null);
  const locale = getCurrentLocale(pathname, searchParams.get("lang"), browserLocale);
  const communityHref = `/community?lang=${locale}`;
  const close = () => setOpen(false);

  useEffect(() => {
    if (!searchParams.get("lang")) {
      setBrowserLocale(getCurrentLocale(pathname, null, null, true));
    }
  }, [pathname, searchParams]);

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
          <Link href={communityHref} onClick={close}>Community</Link>
          <Link href="/contribute" onClick={close}>Contribute</Link>
          <Link href="/suggest-topic" onClick={close}>Suggest Topic</Link>
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
