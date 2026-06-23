import Link from "next/link";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="GYEOL home">
          <span className="brand-mark">GYEOL</span>
          <span className="brand-sub">결 · Global Fact Registry</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href="/#registry">Registry</Link>
          <Link href="/#developers">Developers</Link>
          <Link href="/#ai-systems">AI</Link>
          <Link href="/suggest-topic" className="site-nav-cta">
            Suggest
          </Link>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
}
