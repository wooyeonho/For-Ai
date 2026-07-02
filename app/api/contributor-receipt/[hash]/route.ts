import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { getContributorReceipt } from '@/lib/contributor-receipt';

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[a-f0-9]{8,64}$/i.test(hash)) {
    return NextResponse.json({ error: 'Invalid contributor hash' }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ contributor_hash: hash, totals: { points: 0, pending: 0, accepted: 0, rejected: 0, 'verified-linked': 0 }, items: [], privacy: { raw_ip_stored: false, message: 'For-Ai never stores or exposes raw IP addresses for public submissions. This receipt is keyed only by contributor_hash.' } });
  }
  const receipt = await getContributorReceipt(createServerClient(), hash);
  return NextResponse.json(receipt);
}
