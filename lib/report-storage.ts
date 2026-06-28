import { getDocumentBySlug } from './data';
import { makeContributorHashForRequest } from './contributor-hash';
import { createServerClient, isSupabaseConfigured } from './supabase-server';

export type SaveCorrectionReportInput = {
  slug: string;
  message: string;
  report_type?: string;
};

export type SaveCorrectionReportResult =
  | { ok: true; slug: string }
  | { ok: false; status: number; error: string };

export const REPORT_STORAGE_NOT_CONFIGURED_MESSAGE =
  '현재 저장소가 설정되지 않아 접수되지 않았습니다. 운영자에게 Supabase 환경 설정을 확인해 달라고 요청해 주세요.';

export async function saveCorrectionReportForRequest(
  request: Request,
  input: SaveCorrectionReportInput
): Promise<SaveCorrectionReportResult> {
  const message = input.message.trim();
  if (!message) {
    return { ok: false, status: 400, error: 'message is required' };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: REPORT_STORAGE_NOT_CONFIGURED_MESSAGE,
    };
  }

  const doc = getDocumentBySlug(input.slug);
  const documentId = doc?.id ?? null;
  const entityId = doc?.entity_id ?? null;

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[report] Contributor salt missing:', error);
    return { ok: false, status: 500, error: 'Server configuration error' };
  }

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('reports').insert({
      document_id: documentId,
      entity_id: entityId,
      report_type: input.report_type ?? 'correction',
      message,
      contributor_hash: contributorHash,
      status: 'new',
    });

    if (error) {
      console.error('[report] Supabase insert error:', error.message);
      return { ok: false, status: 500, error: 'Failed to save report' };
    }
  } catch (err) {
    console.error('[report] Unexpected error:', err);
    return { ok: false, status: 500, error: 'Server error' };
  }

  return { ok: true, slug: input.slug };
}
