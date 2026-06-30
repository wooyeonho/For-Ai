"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, isValidLocale } from "../../lib/i18n";
import { LanguageSelector } from "./LanguageSelector";

const EXPLORE_LINKS = [
  { href: "bounties", label: "Bounties", description: "Claim gaps that need sources" },
  { href: "challenges", label: "Challenges", description: "Community verification goals" },
  { href: "missions", label: "Missions", description: "Daily source-backed tasks" },
  { href: "quests", label: "Country Quests", description: "Coverage by country" },
  { href: "leaderboard", label: "Leaderboard", description: "Anonymous contributor progress" },
];

function getCurrentLocale(pathname: string) {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = getCurrentLocale(pathname);
  const close = () => setOpen(false);
  const localeHref = (path: string) => `/${locale}/${path}`;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href="/#registry">Registry</Link>
          <details className="explore-menu">
            <summary>Explore</summary>
            <div className="explore-menu-panel">
              {EXPLORE_LINKS.map((item) => (
                <Link key={item.href} href={localeHref(item.href)} className="explore-menu-item">
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </Link>
              ))}
            </div>
          </details>
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
          <div className="site-nav-mobile-group" aria-label="Explore">
            <span className="site-nav-mobile-heading">Explore</span>
            {EXPLORE_LINKS.map((item) => (
              <Link key={item.href} href={localeHref(item.href)} onClick={close}>
                {item.label}
              </Link>
            ))}
          </div>
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
