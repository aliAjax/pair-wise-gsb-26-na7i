// 领域模型与规则共用类型（不依赖 React / 存储 / 页面）

export type Role = "counselor" | "client" | "supervisor";

export interface Counselor {
  id: string;
  name: string;
}

/** 场次状态：进行中、已取消（通过调整单取消后保留可查） */
export type SessionStatus = "active" | "cancelled";

export interface Session {
  id: string;
  theme: string;
  counselorId: string;
  startAt: number; // epoch ms
  durationMin: number;
  capacity: number;
  /** 督导锁定：直接编辑/取消入口关闭，只能走带原因的调整单 */
  locked: boolean;
  status: SessionStatus;
  createdAt: number;
  /** 调整生效后对原场次资料的留痕，原席位与名单不受影响 */
  changes: SessionChange[];
}

export interface SessionChange {
  at: number;
  adjustmentId: string;
  summary: string;
}

/**
 * 报名状态：
 * waiting 候补（按提交先后排队）
 * offered 候补转正提醒已发，等待本人 24 小时内确认
 * booked  正式席位（直接报上或候补确认后）
 * exited  本人退出，记录留在原场次
 * lapsed  转正提醒超时未确认，或本人婉拒，资格作废
 */
export type EnrollmentStatus = "waiting" | "offered" | "booked" | "exited" | "lapsed";

export interface Enrollment {
  id: string;
  sessionId: string;
  clientName: string;
  status: EnrollmentStatus;
  /** 同一时间戳下的次序，保证先提交先排队 */
  seq: number;
  requestedAt: number;
  /** offered 截止时间 = 提醒发出时间 + 24h；其他状态为 null */
  offerExpiresAt: number | null;
  offeredAt: number | null;
  confirmedAt: number | null;
  exitedAt: number | null;
  /** 退出时所处身份（正式席位 / 候补），留痕用 */
  exitFrom: EnrollmentStatus | null;
  /** 资格作废原因：超时未确认 / 本人婉拒 */
  lapseReason: "timeout" | "declined" | null;
}

export type NotificationKind = "offer" | "promoted";

export interface AppNotification {
  id: string;
  enrollmentId: string;
  sessionId: string;
  clientName: string;
  kind: NotificationKind;
  message: string;
  createdAt: number;
  expiresAt: number;
  read: boolean;
}

export type AdjustmentType = "edit" | "cancel";

export interface AdjustmentPayload {
  /** edit：新主题 */
  theme?: string;
  /** edit：新开组时间 */
  startAt?: number;
  /** edit：新时长（分钟） */
  durationMin?: number;
  /** edit：新容量（不得低于当前正式席位数） */
  capacity?: number;
}

export type AdjustmentStatus = "pending" | "approved" | "rejected";

export interface Adjustment {
  id: string;
  sessionId: string;
  type: AdjustmentType;
  reason: string;
  payload: AdjustmentPayload;
  status: AdjustmentStatus;
  requestedBy: string;
  requestedAt: number;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
}

export interface AppState {
  counselors: Counselor[];
  sessions: Session[];
  enrollments: Enrollment[];
  notifications: AppNotification[];
  adjustments: Adjustment[];
  /** 模拟时钟相对真实时间的偏移（毫秒），便于演示 24 小时超时 */
  clockOffsetMs: number;
  seq: number;
}

/** 转正提醒有效时长：一天 */
export const OFFER_WINDOW_MS = 24 * 60 * 60 * 1000;
