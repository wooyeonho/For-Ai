import Link from "next/link";
import { LanguageSelector } from "./LanguageSelector";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="For-Ai home">
          <span className="brand-mark">For-Ai</span>
        </Link>
        <nav className="site-nav" aria-label="Main menu">
          <Link href="/#registry">문서</Link>
          <Link href="/community">커뮤니티</Link>
          <Link href="/suggest-topic">제안</Link>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
}
