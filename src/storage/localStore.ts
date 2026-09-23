// 本地保存模块：仅负责 AppState 的持久化读写，不含任何业务规则
import type { AppState } from "../domain/types.js";

export const STORAGE_KEY = "hxwl12.groupScheduling.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__hxwl12_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function loadState(): AppState | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.enrollments)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: AppState): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  const storage = getStorage();
  storage?.removeItem(STORAGE_KEY);
}
