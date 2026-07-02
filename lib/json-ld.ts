// Serialize JSON for embedding inside <script> tags. JSON.stringify alone does
// not escape "<", so attacker-influenced text containing "</script>" would
// terminate the script block and inject markup (stored XSS). Escaping <, >, &
// and the JS line separators keeps the payload inert while remaining valid JSON.
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
