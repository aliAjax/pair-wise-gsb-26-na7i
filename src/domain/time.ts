// 时间工具：纯函数，不依赖 React / 存储

import type { TimeRange } from "../types";

const HOUR = 60 * 60 * 1000;
export const OFFER_WINDOW_MS = 24 * HOUR;

export function toTime(value: string | number | Date): number {
  return new Date(value).getTime();
}

/** 两个时间段是否重叠（首尾相接不算重叠） */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toTime(a.start) < toTime(b.end) && toTime(b.start) < toTime(a.end);
}

export function isPast(session: TimeRange, now: Date): boolean {
  return toTime(session.end) <= now.getTime();
}

export function addHours(value: string | Date, hours: number): string {
  return new Date(toTime(value) + hours * HOUR).toISOString();
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRange(t: TimeRange): string {
  const s = new Date(t.start);
  const e = new Date(t.end);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
  return `${day} ${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

/** 距某个时间点的中文剩余/已过描述 */
export function relative(iso: string, now: Date): string {
  const diff = toTime(iso) - now.getTime();
  const abs = Math.abs(diff);
  const hours = Math.round(abs / HOUR);
  if (hours < 1) return diff >= 0 ? "不足 1 小时" : "刚过";
  const days = Math.round(hours / 24);
  if (hours < 24) return diff >= 0 ? `${hours} 小时后` : `${hours} 小时前`;
  return diff >= 0 ? `${days} 天后` : `${days} 天前`;
}

/** <input type="datetime-local"> 值 <-> ISO */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
