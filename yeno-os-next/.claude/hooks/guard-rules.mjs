// Deterministic guard rules. CLAUDE.md is guidance; these rules are the
// enforcement, so they must be pure, testable and independent of any model
// output. Everything not explicitly denied or asked for stays allowed.

export const DENY = 'deny';
export const ASK = 'ask';
export const ALLOW = 'allow';

/**
 * Commands are normalised before matching so quote/spacing/base64 tricks do not
 * slip past the rules: quotes and backslashes are dropped, whitespace is
 * collapsed, and obvious indirection is flagged on its own.
 */
export function normalizeCommand(raw) {
  return String(raw ?? '')
    .replace(/[\\'"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Detects shell indirection on the raw command, before normalisation strips the
 * characters that reveal it. Returns null when the command is literal.
 */
export function detectIndirection(raw) {
  const command = String(raw ?? '');
  for (const rule of INDIRECTION_RULES) {
    if (rule.re.test(command)) return rule.code;
  }
  return null;
}

/**
 * Shell expansion the guard cannot resolve statically: `x=push; git $x`,
 * `git $(echo push)`, `eval`, `sh -c`, `xargs`. Pattern matching after
 * expansion is impossible here, so unresolvable indirection is refused rather
 * than guessed. Run the literal command instead.
 */
const INDIRECTION_RULES = [
  { code: 'COMMAND_SUBSTITUTION', re: /\$\(|`|<\(/ },
  { code: 'VARIABLE_EXPANSION', re: /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?/ },
  { code: 'INDIRECT_EXECUTION', re: /(^|[\s;|&])(eval|exec|source|xargs)\s/ },
  { code: 'SHELL_WRAPPER', re: /(^|[\s;|&])(ba|z|k|da)?sh\s+(-[a-z]*[cs]|--command)\b/ },
  { code: 'ALIAS_DEFINITION', re: /(^|[\s;|&])(alias|function)\s/ },
];

const EXTERNAL_EFFECT_RULES = [
  { code: 'GIT_MUTATION', re: /\bgit\s+(commit|push|merge|rebase|tag|cherry-pick|revert|remote\s+(add|set-url))\b/ },
  { code: 'GIT_HISTORY_DESTRUCTIVE', re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+.*--force)/ },
  { code: 'GIT_CONFIG_CHANGE', re: /\bgit\s+config\b/ },
  { code: 'PR_CREATION', re: /\bgh\s+(pr|release|repo)\b/ },
  { code: 'PACKAGE_INSTALL', re: /\b(npm|pnpm|yarn|npx|pip|pip3|uv|cargo|gem|brew)\s+(i|install|add|create)\b/ },
  { code: 'SYSTEM_INSTALL', re: /\b(apt|apt-get|dnf|yum|snap|winget|choco)\s+(install|upgrade)\b/ },
  { code: 'PRIVILEGE_ESCALATION', re: /(^|\s)(sudo|doas|runas)\s/ },
  { code: 'DEPLOY', re: /\b(vercel|netlify|fly|railway|docker\s+push|kubectl\s+apply|terraform\s+apply)\b/ },
  { code: 'REMOTE_CODE_EXECUTION', re: /\b(curl|wget)\b[^|;]*\|\s*(ba)?sh\b/ },
  { code: 'PIPED_DECODE_EXECUTION', re: /\b(base64|xxd|openssl\s+enc)\b[^|;]*\|\s*(ba)?sh\b/ },
  { code: 'RECURSIVE_DELETE', re: /\brm\s+-[a-z]*r[a-z]*f?\b|\brm\s+-[a-z]*f[a-z]*r\b/ },
  { code: 'SECRET_READ', re: /\b(cat|less|more|head|tail|bat|type|strings)\b[^|;]*\.env\b/ },
  { code: 'SECRET_DUMP', re: /\b(printenv|env)\b(?!\s+[a-z_]*=)/ },
  { code: 'CREDENTIAL_STORE', re: /\b(cmdkey|security\s+find-generic-password|gnome-keyring|dpapi)\b/ },
  { code: 'PERMISSION_BYPASS_FLAG', re: /--dangerously-skip-permissions/ },
  { code: 'DB_STATE_DELETE', re: /\brm\b[^|;]*state\/yeno\.db|\bdrop\s+table\b|\bdrop\s+trigger\b/ },
  { code: 'SCHEDULER_ENABLE', re: /\b(crontab|systemctl\s+enable|schtasks\s+\/create)\b/ },
];

const PROTECTED_WRITE_PATTERNS = [
  { code: 'APPLIED_MIGRATION_EDIT', re: /migrations\/\d{4}_[a-z0-9_]+\.sql$/i, appliedOnly: true },
  { code: 'CHECKSUM_PIN_EDIT', re: /migrations\/CHECKSUMS\.json$/i },
  { code: 'SECRET_FILE_WRITE', re: /(^|\/)\.env(\..*)?$/i },
  { code: 'GIT_INTERNALS_WRITE', re: /(^|\/)\.git\// },
  { code: 'GUARD_SELF_EDIT', re: /\.claude\/(settings\.json|hooks\/)/i },
  { code: 'FROZEN_FIXTURE_EDIT', re: /(^|\/)fixtures\/source\// },
];

const WRITE_TOOLS = new Set(['write', 'edit', 'multiedit', 'notebookedit', 'update']);

function decision(permission, code, reason) {
  return { permission, code, reason };
}

/**
 * @param input {{tool_name?: string, tool_input?: object}}
 * @param context {{appliedMigrations?: string[]}}
 */
export function evaluateToolUse(input, context = {}) {
  const tool = String(input?.tool_name ?? '').toLowerCase();
  const toolInput = input?.tool_input ?? {};
  const applied = new Set(context.appliedMigrations ?? []);

  if (tool === 'bash' || tool === 'shell' || tool === 'exec') {
    const command = normalizeCommand(toolInput.command);
    if (command === '') return decision(ALLOW, 'EMPTY', 'no command');
    const indirection = detectIndirection(toolInput.command);
    if (indirection) {
      return decision(
        DENY,
        indirection,
        `the guard cannot resolve shell expansion (${indirection}); run the literal command instead`,
      );
    }
    for (const rule of EXTERNAL_EFFECT_RULES) {
      if (rule.re.test(command)) {
        return decision(DENY, rule.code, `blocked by guard rule ${rule.code}: needs an Owner approval packet`);
      }
    }
    if (/\bgit\s+(add|stage)\b/.test(command)) {
      return decision(ASK, 'GIT_STAGING', 'staging is only useful before a commit, which needs Owner approval');
    }
    return decision(ALLOW, 'BASH_OK', 'local read/edit/test command');
  }

  if (WRITE_TOOLS.has(tool)) {
    const path = String(toolInput.file_path ?? toolInput.path ?? '').replace(/\\/g, '/');
    for (const rule of PROTECTED_WRITE_PATTERNS) {
      if (!rule.re.test(path)) continue;
      if (rule.appliedOnly) {
        const filename = path.split('/').pop();
        if (!applied.has(filename)) continue;
        return decision(DENY, rule.code, `${filename} is already applied and immutable; add a new migration`);
      }
      return decision(DENY, rule.code, `writes to ${path} are blocked by guard rule ${rule.code}`);
    }
    return decision(ALLOW, 'WRITE_OK', 'local file edit inside the work order');
  }

  if (tool === 'webfetch' || tool === 'websearch') {
    return decision(ASK, 'NETWORK_READ', 'external content is untrusted data and must be recorded as a source');
  }

  return decision(ALLOW, 'UNKNOWN_TOOL', 'no rule matched');
}

/**
 * Completion guard: refuses the "done" marker while an open work order has no
 * evidence. It never blocks the Owner from ending a session.
 */
export function evaluateCompletion({ openWorkOrdersWithoutEvidence = 0, testsPassing = null } = {}) {
  if (openWorkOrdersWithoutEvidence > 0) {
    return decision(
      DENY,
      'NO_EVIDENCE',
      `${openWorkOrdersWithoutEvidence} open work order(s) have no evidence_ref; a gate cannot be marked complete`,
    );
  }
  if (testsPassing === false) {
    return decision(DENY, 'TESTS_FAILING', 'tests are failing; completion is not allowed');
  }
  return decision(ALLOW, 'COMPLETION_OK', 'evidence present');
}
