// 领域模型：场次资料相关的全部数据结构

/** 时间段（ISO 字符串），同一人在重叠时段只能占一个组 */
export interface TimeRange {
  start: string;
  end: string;
}

export interface Counselor {
  id: string;
  name: string;
}

export interface Client {
  id: string;
  /** 来访者代号，如 C-042 */
  code: string;
  name: string;
}

export type GroupStatus = "open" | "locked" | "cancelled";

/** 顾问开出的团体小组场次 */
export interface GroupSession extends TimeRange {
  id: string;
  /** 主题，如 焦虑情绪管理 */
  topic: string;
  /** 带组顾问 */
  leaderId: string;
  /** 登记容量 */
  capacity: number;
  room: string;
  status: GroupStatus;
  note?: string;
}

/** 排队条目状态 */
export type EntryStatus =
  | "confirmed" // 已占席位
  | "waiting" // 候补中
  | "offered" // 收到转正提醒，等待确认
  | "withdrawn" // 退出（记录留在原场次）
  | "expired" // 收到提醒但一天内未确认，顺延
  | "declined" // 明确放弃转正
  | "cancelled"; // 候补自行取消报名

export interface QueueEntry {
  id: string;
  sessionId: string;
  clientId: string;
  status: EntryStatus;
  /** 报名提交时间（先后顺序依据） */
  joinedAt: string;
  /** 转正提醒发出时间 */
  offeredAt?: string;
  /** 提醒截止时间 = offeredAt + 24h */
  expiresAt?: string;
  /** 确认 / 退出 / 顺延等状态变更时间 */
  decidedAt?: string;
}

/** 退出记录（永远留在原场次可查） */
export interface WithdrawalRecord {
  id: string;
  sessionId: string;
  clientId: string;
  /** 退出时的身份：confirmed 席位退出 / waiting 候补退出 / offered 提醒中退出 */
  fromStatus: EntryStatus;
  reason: string;
  withdrawnAt: string;
}

export type AdjustmentKind = "capacity" | "schedule" | "cancel";
export type AdjustmentStatus = "pending" | "approved" | "rejected";

/** 督导锁定组的调整单：锁定组不能直接改，只能另建带原因的调整单 */
export interface AdjustmentOrder {
  id: string;
  sessionId: string;
  kind: AdjustmentKind;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: AdjustmentStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** 容量调整目标 */
  newCapacity?: number;
  /** 时间调整目标 */
  newTime?: TimeRange;
  /** 提审 / 批准时的席位与名单快照，原席位和名单继续可查 */
  snapshot: {
    status: GroupStatus;
    capacity: number;
    time: TimeRange;
    entries: Array<Pick<QueueEntry, "clientId" | "status" | "joinedAt" | "offeredAt">>;
  };
}

export interface AppData {
  counselors: Counselor[];
  clients: Client[];
  sessions: GroupSession[];
  entries: QueueEntry[];
  withdrawals: WithdrawalRecord[];
  adjustments: AdjustmentOrder[];
  /** 机构当前时间（页面上可快进，用于演示一天确认期） */
  now: string;
}

/** 操作结果：统一携带提示信息，便于页面反馈 */
export interface OpResult {
  ok: boolean;
  message: string;
}
