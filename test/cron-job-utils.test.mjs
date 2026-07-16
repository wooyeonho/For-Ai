import test from "node:test";
import assert from "node:assert/strict";
import { cronAuditIdentityHash, writeAuditEvent } from "../scripts/lib/cron-job-utils.mjs";

test("cron audit identities are deterministic SHA-256 hashes scoped by action", () => {
  const first = cronAuditIdentityHash("cron.check_source_health");
  const again = cronAuditIdentityHash("cron.check_source_health");
  const other = cronAuditIdentityHash("admin.digest.generated");

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, again);
  assert.notEqual(first, other);
});

test("cron audit writes satisfy the recovered identity and target contract", async () => {
  let inserted = null;
  const supabase = {
    from(table) {
      assert.equal(table, "admin_audit_events");
      return {
        async insert(row) {
          inserted = row;
          return { error: null };
        },
      };
    },
  };

  await writeAuditEvent(supabase, {
    action: "cron.check_source_health",
    metadata: { target_id: "source-health", checked: 2 },
  });

  assert.equal(inserted.admin_user_id, null);
  assert.match(inserted.admin_user_hash, /^[0-9a-f]{64}$/);
  assert.equal(inserted.target_id, "source-health");
  assert.equal(inserted.metadata.checked, 2);
  assert.equal(inserted.metadata.dry_run, false);
});
