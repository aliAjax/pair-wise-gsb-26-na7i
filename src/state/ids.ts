// ID 生成：本地单机应用，时间戳 + 随机串足够
export function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
