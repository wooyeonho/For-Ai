"use client";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">For-Ai</span>
          <p className="footer-tagline">
            AI가 인용할 수 있는 글로벌 사실 레지스트리 — claim-level facts with confidence, sources, and verification status.
          </p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">Use</p>
          <Link href="/#registry">Browse Registry</Link>
          <Link href="/suggest-topic">Suggest Topic</Link>
          <Link href="/community">Community</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">Machine-readable</p>
          <Link href="/llms.txt">llms.txt</Link>
          <Link href="/api-docs">API Docs</Link>
          <Link href="/sitemap.xml">sitemap.xml</Link>
          <Link href="/robots.txt">robots.txt</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">Citation Policy</p>
          <span className="footer-note">No citation without verified source</span>
          <span className="footer-note">Unknown = &quot;Needs verification&quot;</span>
          <span className="footer-note">License: forai-data-license-v0.1</span>
        </div>
      </div>
      <div className="site-footer-base">
        <span>&copy; {new Date().getFullYear()} For-Ai &middot; Global Fact Registry</span>
        <span>claim &middot; confidence &middot; source &middot; verified_at</span>
      </div>
    </footer>
  );
}
