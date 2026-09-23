// 本地保存：localStorage 读写，带版本号。与领域规则、页面完全分开。

import type { AppData } from "../types";

const STORAGE_KEY = "group-scheduling:v1";

export function loadData(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    // 最小结构校验，损坏数据不采用
    if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.entries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式 / 配额超限时静默失败，页面仍可内存运行
  }
}

export function clearData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const storageKey = STORAGE_KEY;
