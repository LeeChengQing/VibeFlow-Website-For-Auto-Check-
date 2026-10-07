export function formatKeysForKawang(keys: string[]): string {
  // 368云寄售 standard format: one plaintext key per line
  return keys.map(k => k.trim()).filter(k => k.length > 0).join('\r\n');
}
