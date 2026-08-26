// Parser registry for G2 intake.
//
// A parser turns raw bytes into records; it never invents them. Each parser
// declares whether it can yield a conversation *body*, because the difference
// between a title and a body decides whether an inbox item may ever leave
// BODY_MISSING. An unrecognised format is rejected with a reason instead of
// being guessed at.
import { sha256 } from '../core/hash.mjs';

/** Stable identity for a conversation that carries no official id of its own. */
function derivedId(title, createdAt) {
  return `CONV-${sha256(`${title}\u0000${createdAt ?? ''}`).slice(0, 24)}`;
}

function isoOrNull(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Official ChatGPT `conversations.json`: an array of conversations whose
 * messages hang off a `mapping` graph. Bodies are read from
 * `message.content.parts`; anything without parts stays absent.
 */
function parseChatGptExport(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('chatgpt export must be a JSON array of conversations');
  return data.map((conv) => {
    const messages = [];
    for (const node of Object.values(conv.mapping ?? {})) {
      const msg = node?.message;
      if (!msg) continue;
      const parts = (msg.content?.parts ?? []).filter((p) => typeof p === 'string' && p !== '');
      if (parts.length === 0) continue;
      messages.push({
        role: msg.author?.role ?? 'unknown',
        text: parts.join('\n'),
        at: isoOrNull(msg.create_time),
      });
    }
    const title = String(conv.title ?? '').trim();
    return {
      external_id: typeof conv.id === 'string' ? conv.id : derivedId(title, isoOrNull(conv.create_time)),
      title,
      created_at: isoOrNull(conv.create_time),
      messages,
    };
  });
}

/**
 * Official Claude export: conversations with `chat_messages[].text`.
 */
function parseClaudeExport(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('claude export must be a JSON array of conversations');
  return data.map((conv) => ({
    external_id: typeof conv.uuid === 'string' ? conv.uuid : derivedId(String(conv.name ?? ''), conv.created_at),
    title: String(conv.name ?? '').trim(),
    created_at: typeof conv.created_at === 'string' ? conv.created_at : null,
    messages: (conv.chat_messages ?? [])
      .map((m) => ({
        role: m.sender ?? 'unknown',
        text: typeof m.text === 'string' ? m.text : '',
        at: typeof m.created_at === 'string' ? m.created_at : null,
      }))
      .filter((m) => m.text !== ''),
  }));
}

/**
 * The 144 title ledger: markdown rows that carry a title and often an external
 * id such as `TSP-017`. Titles only — this parser can never produce a body, so
 * everything it yields stays BODY_MISSING until an official export arrives.
 */
function parseTitleLedger(text) {
  const out = [];
  const seen = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || /^\|?\s*[-:| ]+\|?$/.test(line)) continue;

    let externalId = null;
    let title = null;
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 2) continue;
      const idCell = cells.find((c) => /^(TSP|SCG|RSP|PCR|UP|UG|X)-\d+$/i.test(c));
      externalId = idCell ? idCell.toUpperCase() : null;
      title = cells.find((c) => c !== '' && c !== externalId && !/^(TSP|SCG|RSP|PCR|UP|UG|X)-\d+$/i.test(c)) ?? null;
    } else {
      const bullet = /^(?:[-*]\s+|\d+[.)]\s+)(.*)$/.exec(line);
      if (!bullet) continue;
      const rest = bullet[1].replace(/^\[[ xX]\]\s*/, '').trim();
      const withId = /^((?:TSP|SCG|RSP|PCR|UP|UG|X)-\d+)\s*[—:-]\s*(.+)$/i.exec(rest);
      if (withId) {
        externalId = withId[1].toUpperCase();
        title = withId[2].trim();
      } else title = rest;
    }

    if (title === null || title === '') continue;
    title = title.replace(/^[`"']|[`"']$/g, '').trim();
    const key = externalId ?? title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ external_id: externalId ?? derivedId(title, null), title, created_at: null, messages: [] });
  }
  return out;
}

/** An opaque file: one record, body present, no conversation structure. */
function parsePlainFile(text) {
  const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? '';
  const title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 200) || 'untitled file';
  return [{ external_id: derivedId(title, null), title, created_at: null, messages: [{ role: 'file', text, at: null }] }];
}

export const PARSERS = [
  {
    parserId: 'chatgpt-export/v1',
    kind: 'CHAT_EXPORT',
    version: 'v1',
    mediaTypes: ['application/json'],
    yieldsBody: true,
    parse: parseChatGptExport,
  },
  {
    parserId: 'claude-export/v1',
    kind: 'CHAT_EXPORT',
    version: 'claude-v1',
    mediaTypes: ['application/json'],
    yieldsBody: true,
    parse: parseClaudeExport,
  },
  {
    parserId: 'title-ledger/v1',
    kind: 'MANUAL',
    version: 'v1',
    mediaTypes: ['text/markdown'],
    yieldsBody: false,
    parse: parseTitleLedger,
  },
  {
    parserId: 'plain-file/v1',
    kind: 'FILE',
    version: 'v1',
    mediaTypes: ['text/plain'],
    yieldsBody: true,
    parse: parsePlainFile,
  },
];

export function findParser(parserId) {
  return PARSERS.find((p) => p.parserId === parserId) ?? null;
}
