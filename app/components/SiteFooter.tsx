"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getCurrentLocaleFromPath, localizedPath, withLangQuery } from "../../lib/i18n/routing";

export function SiteFooter() {
  const pathname = usePathname();
  const locale = getCurrentLocaleFromPath(pathname);
  const pageLink = (path: string) => localizedPath(locale, path) === path ? withLangQuery(locale, path) : localizedPath(locale, path);
  const formLink = (path: string) => withLangQuery(locale, path);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">For-Ai</span>
          <p className="footer-tagline">
            A global fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Unverified claims are never presented as truth.
          </p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">For Humans</p>
          <Link href={pageLink("/#registry")}>Browse Registry</Link>
          <Link href={formLink("/suggest-topic")}>Suggest Topic</Link>
          <Link href={pageLink("/community")}>Community</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">For Machines</p>
          <Link href={pageLink("/llms.txt")}>llms.txt</Link>
          <Link href={pageLink("/api-docs")}>API Docs</Link>
          <Link href={pageLink("/sitemap.xml")}>sitemap.xml</Link>
          <Link href={pageLink("/robots.txt")}>robots.txt</Link>
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
