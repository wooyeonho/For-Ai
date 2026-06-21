export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://for-ai-e4mm.vercel.app";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}
