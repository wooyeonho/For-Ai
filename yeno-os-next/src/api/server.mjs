// The local facade the Windows shell will read. It is deliberately thin: reads
// come from a read-only handle over the Mission Control views, and every write
// goes command handler -> governor -> transaction -> event -> projection. There
// is no path from an HTTP request to a raw DB mutation, and there is no path at
// all while the emergency stop is engaged.
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { openDb, inTransaction } from '../core/db.mjs';
import { appendEvent, readEvents, head } from '../core/events.mjs';
import { stopEngaged } from '../core/governor.mjs';
import { catchUp } from '../core/projections.mjs';
import { remember, observe } from '../domain/self.mjs';
import { panel, panels, panelNames, g8ReadSideAcceptance } from '../domain/mission-control.mjs';

export const LOOPBACK = '127.0.0.1';
export const DEFAULT_ORIGINS = ['http://localhost', 'http://127.0.0.1', 'tauri://localhost'];
const RATE_LIMIT = { windowMs: 10_000, max: 120 };

/**
 * The whole write vocabulary. A command that is not here cannot be sent, so the
 * shell cannot invent an effect by shaping a request differently.
 */
export const COMMANDS = {
  'self.remember': {
    authority: 'A2',
    handler: (db, body) =>
      remember(db, {
        kind: req(body, 'kind'),
        content: req(body, 'content'),
        sourceRef: req(body, 'source_ref'),
        confidence: Number(req(body, 'confidence')),
        salience: body.salience === undefined ? 0 : Number(body.salience),
      }),
  },
  'self.observe': {
    authority: 'A2',
    handler: (db, body) => observe(db, req(body, 'metric'), Number(req(body, 'value'))),
  },
};

function req(body, key) {
  if (body === null || typeof body !== 'object' || body[key] === undefined || body[key] === null) {
    throw new BadRequest(`missing field ${key}`);
  }
  return body[key];
}

class BadRequest extends Error {}

/**
 * A command is admitted only if the stop is released and the command is known.
 * The audit event is written inside the same transaction as the effect, so an
 * accepted command and its record cannot come apart.
 */
export function runCommand(db, name, body, { actor = 'api', requestId = null } = {}) {
  const spec = COMMANDS[name];
  if (!spec) throw new BadRequest(`unknown command ${name}`);
  if (stopEngaged(db)) {
    const err = new Error('EMERGENCY_STOP: the local API refuses commands while the stop is engaged');
    err.stopped = true;
    throw err;
  }
  const rid = requestId ?? randomUUID();
  const out = inTransaction(db, () => {
    const result = spec.handler(db, body);
    appendEvent(db, {
      eventId: `EVT-api-${rid}`,
      type: 'api.command.accepted',
      actor,
      authority: spec.authority,
      payload: { request_id: rid, command: name },
    });
    return result;
  });
  catchUp(db);
  return { request_id: rid, command: name, result: out };
}

function rateLimiter() {
  const hits = [];
  return () => {
    const now = Date.now();
    while (hits.length > 0 && now - hits[0] > RATE_LIMIT.windowMs) hits.shift();
    if (hits.length >= RATE_LIMIT.max) return false;
    hits.push(now);
    return true;
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new BadRequest('body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BadRequest('body is not JSON');
  }
}

/**
 * @param {object} opts
 * @param {string} opts.dbPath persistent kernel path
 * @param {string} opts.token short-lived scoped token; requests without it are refused
 */
export function createServer({ dbPath, token, origins = DEFAULT_ORIGINS, pollMs = 250 }) {
  if (!token || token.length < 16) throw new Error('API_TOKEN_TOO_WEAK: need at least 16 chars');
  const ro = openDb(dbPath, { readOnly: true });
  const rw = openDb(dbPath);
  const allowed = rateLimiter();
  const streams = new Set();

  const server = createHttpServer((request, response) => {
    const send = (status, body) => {
      const text = JSON.stringify(body);
      response.writeHead(status, {
        'content-type': 'application/json',
        'x-request-id': body.request_id ?? '-',
        'cache-control': 'no-store',
      });
      response.end(text);
    };
    void (async () => {
      try {
        const url = new URL(request.url, `http://${LOOPBACK}`);
        const origin = request.headers.origin;
        if (origin !== undefined && !origins.some((o) => origin === o || origin.startsWith(`${o}:`))) {
          return send(403, { error: 'ORIGIN_NOT_ALLOWED', origin });
        }
        if (request.headers['x-yeno-token'] !== token) {
          return send(401, { error: 'TOKEN_REQUIRED' });
        }
        if (!allowed()) return send(429, { error: 'RATE_LIMITED' });

        if (request.method === 'GET' && url.pathname === '/health') {
          return send(200, {
            ok: true,
            head_seq: head(rw).seq,
            emergency_stop: stopEngaged(rw) ? 'ENGAGED' : 'RELEASED',
            panels: panelNames(),
          });
        }
        if (request.method === 'GET' && url.pathname === '/panels') {
          const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : null;
          return send(200, { ...panels(ro, { limit }), acceptance: g8ReadSideAcceptance(ro) });
        }
        if (request.method === 'GET' && url.pathname.startsWith('/panel/')) {
          const name = url.pathname.slice('/panel/'.length);
          if (!panelNames().includes(name)) return send(404, { error: 'UNKNOWN_PANEL', name });
          const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : null;
          return send(200, panel(ro, name, { limit }));
        }
        if (request.method === 'GET' && url.pathname === '/events/stream') {
          return startStream(request, response, url);
        }
        if (request.method === 'POST' && url.pathname === '/command') {
          const body = await readJson(request);
          try {
            return send(202, runCommand(rw, body.command, body.payload ?? {}, { actor: 'api' }));
          } catch (err) {
            if (err instanceof BadRequest) return send(400, { error: 'BAD_COMMAND', detail: err.message });
            if (err.stopped) return send(423, { error: 'EMERGENCY_STOP', detail: err.message });
            return send(422, { error: 'COMMAND_REFUSED', detail: err.message });
          }
        }
        return send(404, { error: 'NO_ROUTE', path: url.pathname });
      } catch (err) {
        return send(err instanceof BadRequest ? 400 : 500, { error: 'REQUEST_FAILED', detail: err.message });
      }
    })();
  });

  // The shell follows the ledger, not the panels: one append-only stream of what
  // happened, so a projection can never be ahead of an event nobody sent.
  function startStream(request, response, url) {
    let cursor = url.searchParams.has('from') ? Number(url.searchParams.get('from')) : head(rw).seq;
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    // Flush before the first event: a follower must know the stream is open even
    // on a ledger where nothing has happened yet.
    response.flushHeaders();
    response.write(`: open at ${cursor}\n\n`);
    const tick = () => {
      for (const e of readEvents(ro, cursor)) {
        cursor = e.seq;
        response.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      }
    };
    tick();
    const timer = setInterval(tick, pollMs);
    timer.unref?.();
    const stop = () => {
      clearInterval(timer);
      streams.delete(stop);
    };
    streams.add(stop);
    request.on('close', stop);
  }

  return {
    server,
    listen(port = 0) {
      return new Promise((resolve) => {
        // Loopback only. There is no option to bind wider; a LAN listener would
        // have to be a code change, reviewed as one.
        server.listen(port, LOOPBACK, () => resolve(server.address()));
      });
    },
    close() {
      for (const stop of [...streams]) stop();
      return new Promise((resolve) => {
        server.close(() => {
          ro.close();
          rw.close();
          resolve();
        });
      });
    },
  };
}
