import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';

export const revalidate = 600; // 10 minutes

// Derive country quest progress from actual entities/documents
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ quests: [] });
  }

  const sb = createServerClient();

  // Count verified claims per country via entities
  const { data: verifiedDocs, error } = await sb
    .from('documents')
    .select('entity_id, entities(country)')
    .in('status', ['verified', 'published'])
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also count total documents (including unverified) per country for the target
  const { data: allDocs } = await sb
    .from('documents')
    .select('entity_id, status, entities(country)')
    .not('status', 'eq', 'archived')
    .limit(5000);

  const verifiedByCountry = new Map<string, number>();
  for (const doc of verifiedDocs ?? []) {
    const entity = Array.isArray(doc.entities) ? doc.entities[0] : doc.entities;
    const country = (entity as { country?: string } | null)?.country;
    if (!country) continue;
    verifiedByCountry.set(country, (verifiedByCountry.get(country) ?? 0) + 1);
  }

  const totalByCountry = new Map<string, number>();
  for (const doc of allDocs ?? []) {
    const entity = Array.isArray(doc.entities) ? doc.entities[0] : doc.entities;
    const country = (entity as { country?: string } | null)?.country;
    if (!country) continue;
    totalByCountry.set(country, (totalByCountry.get(country) ?? 0) + 1);
  }

  // Build quest list sorted by verified count descending
  const countries = new Set([...verifiedByCountry.keys(), ...totalByCountry.keys()]);
  const quests = Array.from(countries)
    .map((country) => {
      const verified = verifiedByCountry.get(country) ?? 0;
      const total = Math.max(totalByCountry.get(country) ?? 0, 100);
      const target = Math.max(total, 100);
      return {
        country,
        verified_count: verified,
        total_count: totalByCountry.get(country) ?? 0,
        target_count: target,
        progress_pct: Math.round((verified / target) * 100),
      };
    })
    .sort((a, b) => b.verified_count - a.verified_count)
    .slice(0, 50);

  return NextResponse.json({ quests, generated_at: new Date().toISOString() });
}
