import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { buildSocialImageViewModel, renderSocialImage, TWITTER_IMAGE_SIZE } from "../../../../lib/og-image-renderer";

export const runtime = "edge";
export const revalidate = 600;
export const alt = "For-Ai claim registry Twitter image";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);
  if (!bundle) notFound();
  return new ImageResponse(renderSocialImage(buildSocialImageViewModel(bundle, locale), "twitter"), TWITTER_IMAGE_SIZE);
}
