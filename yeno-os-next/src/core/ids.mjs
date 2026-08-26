import { randomUUID } from 'node:crypto';

export function newId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function nowIso(clock = Date) {
  return new Date(clock.now()).toISOString();
}
