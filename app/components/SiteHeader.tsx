"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLocaleFromPathname, getTranslations, withLocaleLink } from "../../lib/i18n/translations";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const t = getTranslations(locale);
  const close = () => setOpen(false);
  const localize = (href: string) => withLocaleLink(pathname, href);

  const navLinks = [
    { href: "/#registry", label: t.nav.registry },
    { href: "/api-docs", label: t.footer.apiDocs },
    { href: "/community", label: t.footer.community },
    { href: "/contribute", label: t.footer.contribute },
    { href: "/suggest-topic", label: t.nav.suggestTopic },
  ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={localize("/")} className="brand" aria-label="For-Ai home" onClick={close}>
          <span className="brand-mark">For-Ai</span>
          <span className="brand-sub">{t.site.subtitle}</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          {navLinks.map((link) => (
            <Link key={link.href} href={localize(link.href)}>{link.label}</Link>
          ))}
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
          {navLinks.map((link) => (
            <Link key={link.href} href={localize(link.href)} onClick={close}>{link.label}</Link>
          ))}
          <div className="site-nav-mobile-lang"><LanguageSelector /></div>
        </nav>
      )}
    </header>
  );
}
