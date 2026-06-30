"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOCALE, getTranslations, isValidLocale, type SupportedLocale } from "../../lib/i18n";

function getCurrentLocale(pathname: string): SupportedLocale {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

function withLocaleContext(href: string, locale: SupportedLocale): string {
  if (href.startsWith("/#")) {
    return `/?lang=${locale}${href.slice(1)}`;
  }

  if (href.startsWith("/") && !href.includes("?") && !href.includes("#")) {
    return `${href}?lang=${locale}`;
  }

  return href;
}

export function SiteFooter() {
  const pathname = usePathname();
  const locale = getCurrentLocale(pathname);
  const { footer } = getTranslations(locale);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">For-Ai</span>
          <p className="footer-tagline">{footer.tagline}</p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{footer.forHumans}</p>
          <Link href={withLocaleContext("/#registry", locale)}>{footer.browseRegistry}</Link>
          <Link href={withLocaleContext("/suggest-topic", locale)}>{footer.suggestTopic}</Link>
          <Link href={withLocaleContext("/community", locale)}>{footer.community}</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{footer.forMachines}</p>
          <Link href="/llms.txt">llms.txt</Link>
          <Link href={withLocaleContext("/api-docs", locale)}>{footer.apiDocs}</Link>
          <Link href="/sitemap.xml">sitemap.xml</Link>
          <Link href="/robots.txt">robots.txt</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">{footer.citationPolicy}</p>
          <span className="footer-note">{footer.noCiteWithoutSource}</span>
          <span className="footer-note">{footer.unknownNeedsVerification}</span>
          <span className="footer-note">{footer.licenseLabel}</span>
        </div>
      </div>
      <div className="site-footer-base">
        <span>&copy; {new Date().getFullYear()} For-Ai &middot; Global Fact Registry</span>
        <span>claim &middot; confidence &middot; source &middot; verified_at</span>
      </div>
    </footer>
  );
}
