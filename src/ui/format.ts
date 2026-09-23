// 页面层的展示辅助函数（不含业务规则）
import type { EnrollmentStatus } from "../domain/types.js";

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDateInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateInput(value: string): number {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) throw new Error("时间格式无效");
  return ts;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "已超时";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `剩 ${days} 天 ${hours % 24} 小时`;
  }
  return `剩 ${hours} 小时 ${minutes} 分`;
}

export const statusLabel: Record<EnrollmentStatus, string> = {
  booked: "正式席位",
  waiting: "候补中",
  offered: "待确认",
  exited: "已退出",
  lapsed: "资格作废",
};

export const statusClass: Record<EnrollmentStatus, string> = {
  booked: "tag-booked",
  waiting: "tag-waiting",
  offered: "tag-offered",
  exited: "tag-exited",
  lapsed: "tag-lapsed",
};
