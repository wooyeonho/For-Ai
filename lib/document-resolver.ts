import { getDocumentBySlug } from './data';
import { getDocumentMetadataFromSupabase } from './supabase-documents';

export type ResolvedDocumentMetadata = {
  documentId: string | null;
  entityId: string | null;
  title: string;
  lang: string;
  category: string;
  country: string | null;
};

export async function resolveDocumentMetadataBySlug(slug: string): Promise<ResolvedDocumentMetadata> {
  const staticDocument = getDocumentBySlug(slug);
  if (staticDocument) {
    return {
      documentId: staticDocument.id,
      entityId: staticDocument.entity_id,
      title: staticDocument.title,
      lang: staticDocument.lang,
      category: staticDocument.category,
      country: staticDocument.country || null,
    };
  }

  const supabaseDocument = await getDocumentMetadataFromSupabase(slug);
  if (supabaseDocument) return supabaseDocument;

  return {
    documentId: null,
    entityId: null,
    title: slug,
    lang: 'en',
    category: 'unknown',
    country: null,
  };
}
