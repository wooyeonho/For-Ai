import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { suggestSourceService } from '@/lib/services/source-suggest';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'submission_storage_unavailable' }, { status: 503 });
  const result = await suggestSourceService(createServerClient(), request, body);
  if (result.ok) return NextResponse.json(result.data, { status: result.status ?? 200 });
  return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status });
}
