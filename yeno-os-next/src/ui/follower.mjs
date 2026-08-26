/**
 * The shell's refresh policy (G8).
 *
 * A UI that polls shows the Owner a screen that is quietly out of date; a UI that
 * follows a stream shows a screen that is out of date *loudly*, or not at all.
 * This module is the follower half of the second option, and it exists separately
 * from the renderer because the interesting behaviour is not parsing SSE — it is
 * what to do when the stream misbehaves:
 *
 *   - sequence numbers only ever move forward; a repeat or a regression is a
 *     protocol violation, not a hint to redraw twice;
 *   - a gap between the last seen sequence and the next one means events were
 *     missed, so the panels must be refetched rather than patched, because a
 *     patched panel would be a screen assembled from events nobody saw;
 *   - a dropped connection makes the screen `stale`. It does not clear it (the
 *     Owner still needs to read the last known truth) and it does not keep
 *     pretending it is live;
 *   - resuming asks for `?from=<lastSeq>`, so reconnecting is exactly as
 *     trustworthy as the ledger's ordering and needs no server-side session.
 *
 * The kernel never sends state, only events, so a projection can never be ahead
 * of an event nobody sent.
 */

/** Parse an SSE buffer into complete frames, returning the unconsumed remainder. */
export function parseFrames(buffer) {
  const frames = [];
  let rest = buffer;
  let cut = rest.indexOf('\n\n');
  while (cut !== -1) {
    const raw = rest.slice(0, cut);
    rest = rest.slice(cut + 2);
    cut = rest.indexOf('\n\n');
    if (raw.startsWith(':')) continue; // a comment, e.g. the open marker
    const frame = {};
    for (const line of raw.split('\n')) {
      const at = line.indexOf(': ');
      if (at === -1) continue;
      frame[line.slice(0, at)] = line.slice(at + 2);
    }
    if (frame.id === undefined) continue;
    frames.push({ seq: Number(frame.id), type: frame.event, data: JSON.parse(frame.data) });
  }
  return { frames, rest };
}

export class Follower {
  /** @param {{ from?: number }} options `from` is the sequence already on screen. */
  constructor({ from = 0 } = {}) {
    this.lastSeq = from;
    this.live = false;
    this.stale = true;
    this.refetches = 0;
    this.applied = 0;
    this.buffer = '';
  }

  /** The query the shell reconnects with. Resume is a ledger position, not a session. */
  resumeQuery() {
    return `?from=${this.lastSeq}`;
  }

  open() {
    this.live = true;
    this.stale = false;
    // Opening is not proof of freshness: whatever happened while the connection
    // was down has to be read before the screen can be believed again.
    return { refetch: this.refetches > 0 || this.lastSeq > 0 };
  }

  /**
   * Feed raw stream bytes. Returns what the shell should do: the events to apply
   * in order, and whether the panels must be refetched because events were lost.
   */
  feed(chunk) {
    const { frames, rest } = parseFrames(this.buffer + chunk);
    this.buffer = rest;
    const events = [];
    let refetch = false;
    for (const frame of frames) {
      if (frame.seq <= this.lastSeq) {
        // Already on screen. Applying it again would double-count, so it is
        // dropped rather than replayed.
        continue;
      }
      if (frame.seq > this.lastSeq + 1) {
        // Events were missed. A patched screen would show a state assembled from
        // events nobody saw, so the panels are refetched instead.
        refetch = true;
        this.refetches += 1;
      }
      this.lastSeq = frame.seq;
      this.applied += 1;
      events.push(frame);
    }
    return { events, refetch };
  }

  /** The connection went away. The last known truth stays on screen, marked stale. */
  dropped(reason = 'DISCONNECTED') {
    this.live = false;
    this.stale = true;
    return { banner: `stale: ${reason}; last seen event ${this.lastSeq}` };
  }
}
