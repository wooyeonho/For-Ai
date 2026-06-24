"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getTranslations, isValidLocale } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";

export function SiteFooter() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const locale = (segments[0] && isValidLocale(segments[0]) ? segments[0] : "ko") as SupportedLocale;
  const t = getTranslations(locale);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">GYEOL</span>
          <p className="footer-tagline">
            {t.footer.tagline}
          </p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{t.footer.forHumans}</p>
          <Link href="/#registry">{t.footer.browseRegistry}</Link>
          <Link href="/suggest-topic">{t.footer.suggestTopic}</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{t.footer.machineReadable}</p>
          <Link href="/sitemap.xml">sitemap.xml</Link>
          <Link href="/robots.txt">robots.txt</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{t.footer.policy}</p>
          <span className="footer-note">{t.footer.licenseLabel}</span>
          <span className="footer-note">{t.footer.noCiteWithoutSource}</span>
        </div>
      </div>
      <div className="site-footer-base">
        <span>&copy; {new Date().getFullYear()} GYEOL</span>
        <span>claim &middot; confidence &middot; source &middot; verified_at</span>
      </div>
    </footer>
  );
}
