/** Fixed UTC formatting so server and client render the same text. */
export function fmtUnix(sec: number): string {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function fmtExpiry(sec: number): string {
  return sec ? fmtUnix(sec) : 'No expiry';
}
