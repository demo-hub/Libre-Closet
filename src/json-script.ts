/** JSON for a <script> block: "<" is escaped, so no value can close the block. */
export function jsonForScript(value: unknown): string | undefined {
  return JSON.stringify(value)?.replace(/</g, '\\u003c');
}
