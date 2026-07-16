import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { loadCitationDocumentBundle } from "../../../../lib/citation-badge";
import { buildSocialImageViewModel, getSocialImageFonts, renderSocialImage } from "../../../../lib/og-image-renderer";

export const runtime = "nodejs";
export const revalidate = 600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "For-Ai claim verification status";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const bundle = await loadCitationDocumentBundle(slug);
  if (!bundle) notFound();
  return new ImageResponse(renderSocialImage(buildSocialImageViewModel(bundle, locale), "opengraph"), {
    ...size,
    fonts: await getSocialImageFonts(),
  });
}
