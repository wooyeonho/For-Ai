import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';
import { makeContributorHashForRequest } from '../../../../lib/contributor-hash';
import { getDocumentBySlug } from '../../../../lib/data';
import {
  REPORT_MESSAGE_MAX_LENGTH,
  contributorSubmissionRateLimited,
  hasHoneypotValue,
  inspectSubmissionText,
} from '../../../../lib/submission-limits';
import { recordDocumentAnalyticsEvent } from '@/lib/analytics';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (hasHoneypotValue(body)) {
    return NextResponse.json({ error: 'submission rejected', code: 'HONEYPOT_FILLED' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required', code: 'MESSAGE_REQUIRED' }, { status: 400 });
  }

  if (message.length > REPORT_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      {
        error: `message must be ${REPORT_MESSAGE_MAX_LENGTH} characters or fewer`,
        code: 'MESSAGE_TOO_LONG',
        max_length: REPORT_MESSAGE_MAX_LENGTH,
      },
      { status: 400 }
    );
  }

  // Resolve document + entity from slug (static seed data)
  const doc = getDocumentBySlug(slug);
  const documentId = doc?.id ?? null;
  const entityId = doc?.entity_id ?? null;

  // Generate contributor hash — never store raw IP
  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[report] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const limit = contributorSubmissionRateLimited(contributorHash);
      if (limit) {
        return NextResponse.json(
          { error: 'submission rate limit exceeded', code: `RATE_LIMIT_${limit.toUpperCase()}` },
          { status: 429 }
        );
      }

      const spamCheck = inspectSubmissionText([message]);
      const { error } = await supabase.from('reports').insert({
        document_id: documentId,
        entity_id: entityId,
        report_type: body.report_type ?? 'correction',
        message,
        contributor_hash: contributorHash,
        status: spamCheck.status,
      });

      if (error) {
        console.error('[report] Supabase insert error:', error.message);
        return NextResponse.json(
          { error: 'Failed to save report' },
          { status: 500 }
        );
      }
      await recordDocumentAnalyticsEvent(supabase, request, slug, 'report_submission');
    } catch (err) {
      console.error('[report] Unexpected error:', err);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  } else {
    console.error('[report] storage not configured — NOT persisted');
    return NextResponse.json(
      { error: 'submission_storage_unavailable', persisted: false },
      { status: 503 }
    );
  }

  return NextResponse.json({ success: true, slug });
}
