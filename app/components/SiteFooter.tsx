"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "../../lib/i18n";

export function SiteFooter() {
  const pathname = usePathname();
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const locale = firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
  const dir = LOCALE_CONFIG[locale].dir;
  const chromeClassName = `site-footer site-chrome site-chrome-${dir}`;

  return (
    <footer className={chromeClassName} lang={locale} dir={dir}>
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">For-Ai</span>
          <p className="footer-tagline">
            A global fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Unverified claims are never presented as truth.
          </p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">For Humans</p>
          <Link href="/#registry">Browse Registry</Link>
          <Link href="/suggest-topic">Suggest Topic</Link>
          <Link href="/community">Community</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">For Machines</p>
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
