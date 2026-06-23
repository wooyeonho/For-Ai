import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="GYEOL home">
          <span className="brand-mark">GYEOL</span>
          <span className="brand-sub">결 · 로컬 팩트 레지스트리</span>
        </Link>
        <nav className="site-nav" aria-label="주요 메뉴">
          <Link href="/#registry">레지스트리</Link>
          <Link href="/#developers">개발자</Link>
          <Link href="/#ai-systems">AI 연동</Link>
          <Link href="/suggest-topic" className="site-nav-cta">
            토픽 제안
          </Link>
        </nav>
      </div>
    </header>
  );
}
