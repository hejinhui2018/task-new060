/** 秒 → "m:ss" */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 秒 → "45秒" */
export function fmtDur(sec: number): string {
  return `${Math.round(sec)}秒`;
}
