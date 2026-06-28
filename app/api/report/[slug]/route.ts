import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '../../../../lib/supabase-server';
import { makeContributorHashForRequest } from '../../../../lib/contributor-hash';
import { getDocumentBySlug } from '../../../../lib/data';

type ReportRequestBody = {
  field_path?: string;
  message?: string;
  report_type?: string;
};

function redirectToReportPage(request: Request, slug: string, submitted: string) {
  return NextResponse.redirect(new URL(`/report/${slug}?submitted=${submitted}`, request.url), 303);
}

function errorResponse(request: Request, slug: string, message: string, status: number, expectsHtml: boolean, submitted: string) {
  if (expectsHtml) {
    return redirectToReportPage(request, slug, submitted);
  }

  return NextResponse.json({ error: message }, { status });
}

async function parseReportRequest(request: Request): Promise<{ body: ReportRequestBody; expectsHtml: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return { body: await request.json(), expectsHtml: false };
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const formData = await request.formData();
    return {
      body: {
        field_path: String(formData.get('field_path') ?? ''),
        message: String(formData.get('message') ?? ''),
        report_type: String(formData.get('report_type') ?? ''),
      },
      expectsHtml: true,
    };
  }

  throw new Error('Unsupported request body');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: ReportRequestBody;
  let expectsHtml = false;
  try {
    const parsed = await parseReportRequest(request);
    body = parsed.body;
    expectsHtml = parsed.expectsHtml;
  } catch {
    return errorResponse(request, slug, 'Invalid request body', 400, expectsHtml, 'invalid');
  }

  const message = body.message?.trim();
  if (!message) {
    return errorResponse(request, slug, 'message is required', 400, expectsHtml, 'invalid');
  }

  if (!isSupabaseConfigured()) {
    return errorResponse(
      request,
      slug,
      '현재 저장소가 설정되지 않아 접수되지 않았습니다',
      503,
      expectsHtml,
      'storage_unconfigured'
    );
  }

  // Resolve document + entity from slug (static seed data)
  const doc = getDocumentBySlug(slug);
  const documentId = doc?.id ?? null;
  const entityId = doc?.entity_id ?? null;

  // Generate contributor hash on the server — never trust client-provided values or store raw IPs.
  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[report] Contributor salt missing:', error);
    return errorResponse(request, slug, 'Server configuration error', 500, expectsHtml, 'server_error');
  }

  const fieldPath = body.field_path?.trim();
  const reportMessage = fieldPath ? `[field_path: ${fieldPath}]\n${message}` : message;

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('reports').insert({
      document_id: documentId,
      entity_id: entityId,
      report_type: body.report_type?.trim() || 'correction',
      message: reportMessage,
      contributor_hash: contributorHash,
      status: 'new',
    });

    if (error) {
      console.error('[report] Supabase insert error:', error.message);
      return errorResponse(request, slug, 'Failed to save report', 500, expectsHtml, 'failed');
    }
  } catch (err) {
    console.error('[report] Unexpected error:', err);
    return errorResponse(request, slug, 'Server error', 500, expectsHtml, 'server_error');
  }

  if (expectsHtml) {
    return redirectToReportPage(request, slug, '1');
  }

  return NextResponse.json({ success: true, slug });
}
