import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { isValidLocale } from "../../../../lib/i18n";
import { loadCitationDocumentBundle } from "../../../../lib/citation-badge";
import { SOCIAL_IMAGE_CACHE_CONTROL, buildSocialImageViewModel, getSocialImageFonts, renderSocialImage } from "../../../../lib/og-image-renderer";

export const runtime = "nodejs";
export const revalidate = 600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "For-Ai claim verification status";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) notFound();
  const bundle = await loadCitationDocumentBundle(slug);
  if (!bundle) notFound();
  return new ImageResponse(renderSocialImage(buildSocialImageViewModel(bundle, locale), "twitter"), {
    ...size,
    fonts: await getSocialImageFonts(),
    headers: { "Cache-Control": SOCIAL_IMAGE_CACHE_CONTROL },
  });
}
