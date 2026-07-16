"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLocaleFromPathname, getTranslations, withLocaleLink } from "../../lib/i18n/translations";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/embed/")) return null;
  const locale = getLocaleFromPathname(pathname);
  const t = getTranslations(locale);
  const localize = (href: string) => withLocaleLink(pathname, href);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">For-Ai</span>
          <p className="footer-tagline">{t.footer.tagline}</p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{t.footer.forHumans}</p>
          <Link href={localize("/#registry")}>{t.footer.browseRegistry}</Link>
          <Link href={localize("/suggest-topic")}>{t.footer.suggestTopic}</Link>
          <Link href={localize("/community")}>{t.footer.community}</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{t.footer.machineReadable}</p>
          <Link href={localize("/llms.txt")}>llms.txt</Link>
          <Link href={localize("/api-docs")}>{t.footer.apiDocs}</Link>
          <Link href={localize("/sitemap.xml")}>{t.footer.sitemap}</Link>
          <Link href={localize("/robots.txt")}>{t.footer.robots}</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{t.footer.policy}</p>
          <span className="footer-note">{t.footer.noCiteWithoutSource}</span>
          <span className="footer-note">{t.footer.unknownNeedsVerification}</span>
          <span className="footer-note">{t.footer.licenseLabel}</span>
        </div>
      </div>
      <div className="site-footer-base">
        <span>&copy; {new Date().getFullYear()} For-Ai &middot; {t.footer.copyrightSuffix}</span>
        <span>{t.footer.claimSourceVerified}</span>
      </div>
    </footer>
  );
}
