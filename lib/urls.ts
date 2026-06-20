const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://for-ai-e4mm.vercel.app";

export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function documentPageUrl(slug: string, lang = "ko"): string {
  return siteUrl(`/${lang}/wiki/${slug}`);
}

export function apiDocumentUrl(slug: string): string {
  return siteUrl(`/api/documents/${slug}`);
}

export function rawMarkdownUrl(slug: string): string {
  return siteUrl(`/raw/${slug}.md`);
}
