import "server-only";

import { createServerClient, isSupabaseConfigured } from "./supabase-server";
import type { SponsoredPlacement } from "./types-monetization";

export type PublicSponsoredPlacement = Pick<
  SponsoredPlacement,
  "id" | "entity_id" | "placement_type" | "category" | "display_label" | "target_url" | "starts_at" | "ends_at"
> & {
  business_name: string;
};

function isActiveWindow(row: PublicSponsoredPlacement, now = new Date()): boolean {
  const startsAt = row.starts_at ? new Date(row.starts_at) : null;
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

export async function getActiveSponsoredPlacementsForEntity(entityId: string): Promise<PublicSponsoredPlacement[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const sb = createServerClient();
    const { data, error } = await sb
      .from("sponsored_placements")
      .select("id, entity_id, placement_type, category, display_label, target_url, starts_at, ends_at, verified_business_profiles(business_name)")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error || !data) return [];

    return data
      .map((row) => {
        const profile = row.verified_business_profiles as { business_name?: string } | { business_name?: string }[] | null;
        const businessName = Array.isArray(profile) ? profile[0]?.business_name : profile?.business_name;
        return {
          id: String(row.id),
          entity_id: String(row.entity_id),
          placement_type: row.placement_type as PublicSponsoredPlacement["placement_type"],
          category: row.category as string | null,
          display_label: String(row.display_label ?? "Sponsored"),
          target_url: row.target_url as string | null,
          starts_at: row.starts_at as string | null,
          ends_at: row.ends_at as string | null,
          business_name: businessName ?? "Verified sponsor",
        };
      })
      .filter((row) => row.display_label.toLowerCase().includes("sponsored") && isActiveWindow(row));
  } catch {
    return [];
  }
}
