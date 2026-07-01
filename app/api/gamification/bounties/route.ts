import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';
import { requireAdmin, supabaseAdmin, logAdminAuditEvent } from '@/lib/admin-api';

export const revalidate = 120;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ bounties: [] });
  }

  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');
  const category = searchParams.get('category');
  const status = searchParams.get('status') ?? 'open';

  const sb = createServerClient();
  let query = sb
    .from('bounties')
    .select('id, title, description, category, country, points_reward, status, is_sponsored, sponsored_by, expires_at, created_at')
    .eq('status', status)
    .order('points_reward', { ascending: false })
    .limit(50);

  if (country) query = query.eq('country', country);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bounties: data ?? [] });
}

// Admin-only: create a new bounty
export async function POST(request: Request) {
  const adminError = await requireAdmin(request, 'bounties.create');
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });

  const body = await request.json();
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const category = String(body.category ?? 'general').trim();
  const country = String(body.country ?? '').trim() || null;
  const pointsReward = Math.max(10, Math.min(10000, parseInt(String(body.points_reward ?? '100'))));
  const isSponsored = Boolean(body.is_sponsored);
  const sponsoredBy = isSponsored ? String(body.sponsored_by ?? '').trim() || null : null;
  const expiresAt = body.expires_at ? String(body.expires_at) : null;
  const entityId = String(body.entity_id ?? '').trim() || null;
  const claimId = String(body.claim_id ?? '').trim() || null;

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const { data, error } = await sb
    .from('bounties')
    .insert({
      title,
      description,
      category,
      country,
      entity_id: entityId,
      claim_id: claimId,
      points_reward: pointsReward,
      status: 'open',
      is_sponsored: isSponsored,
      sponsored_by: sponsoredBy,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, 'admin.bounties.create', {
    bounty_id: data?.id,
    title,
    points_reward: pointsReward,
    is_sponsored: isSponsored,
  });

  return NextResponse.json({ success: true, bounty_id: data?.id });
}
