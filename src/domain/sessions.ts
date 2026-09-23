// 场次资料模块：场次的创建、查询、容量核算与时段重叠判定
import type {
  AppState,
  Counselor,
  Enrollment,
  Session,
  SessionStatus,
} from "./types.js";

export interface NewSessionInput {
  theme: string;
  counselorId: string;
  startAt: number;
  durationMin: number;
  capacity: number;
}

export function now(state: AppState): number {
  return Date.now() + state.clockOffsetMs;
}

export function getCounselor(state: AppState, counselorId: string): Counselor | undefined {
  return state.counselors.find((c) => c.id === counselorId);
}

export function getSession(state: AppState, sessionId: string): Session | undefined {
  return state.sessions.find((s) => s.id === sessionId);
}

export function sessionEndsAt(session: Session): number {
  return session.startAt + session.durationMin * 60_000;
}

/** 两个开组时段是否重叠（端点相接不算冲突） */
export function intervalsOverlap(
  aStart: number,
  aDurationMin: number,
  bStart: number,
  bDurationMin: number
): boolean {
  return aStart < bStart + bDurationMin * 60_000 && bStart < aStart + aDurationMin * 60_000;
}

/** 与给定时段重叠的有效场次（用于同一人同一时段只能占一个组的校验） */
export function findConflictingSessions(
  state: AppState,
  startAt: number,
  durationMin: number,
  excludeSessionId?: string
): Session[] {
  return state.sessions.filter(
    (s) =>
      s.status === "active" &&
      s.id !== excludeSessionId &&
      intervalsOverlap(s.startAt, s.durationMin, startAt, durationMin)
  );
}

/** 某场次的全部报名记录，按提交先后排序 */
export function enrollmentsOf(state: AppState, sessionId: string): Enrollment[] {
  return state.enrollments
    .filter((e) => e.sessionId === sessionId)
    .sort((a, b) => a.seq - b.seq);
}

/** 占位席位：正式席位 + 已发转正提醒待确认（不确认也先占住，避免超额） */
export function heldSeats(enrollments: Enrollment[]): number {
  return enrollments.filter((e) => e.status === "booked" || e.status === "offered").length;
}

export function countByStatus(
  enrollments: Enrollment[]
): Record<"booked" | "offered" | "waiting" | "exited" | "lapsed", number> {
  const counts = { booked: 0, offered: 0, waiting: 0, exited: 0, lapsed: 0 };
  for (const e of enrollments) counts[e.status] += 1;
  return counts;
}

export function seatsLeft(session: Session, enrollments: Enrollment[]): number {
  return session.capacity - heldSeats(enrollments);
}

/** 名单留痕：含退出与作废记录，仍按提交先后排列 */
export function getRoster(state: AppState, sessionId: string): Enrollment[] {
  return enrollmentsOf(state, sessionId);
}

export function sessionsByStatus(
  state: AppState,
  status: SessionStatus,
  atTime: number
): Session[] {
  return state.sessions
    .filter((s) => s.status === status)
    .sort((a, b) => a.startAt - b.startAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .filter((s) => status === "cancelled" || s.startAt + s.durationMin * 60_000 > atTime);
}

function validateCommon(input: NewSessionInput, state: AppState): string | null {
  if (!input.theme.trim()) return "主题不能为空";
  if (!getCounselor(state, input.counselorId)) return "请选择开组顾问";
  if (!Number.isFinite(input.startAt) || input.startAt <= 0) return "开组时间无效";
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) return "时长必须为正整数（分钟）";
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) return "容量必须为正整数";
  return null;
}

/** 顾问开组：登记主题、容量与开组时间 */
export function createSession(state: AppState, input: NewSessionInput, id: string, atTime: number): Session {
  const error = validateCommon(input, state);
  if (error) throw new Error(error);
  return {
    id,
    theme: input.theme.trim(),
    counselorId: input.counselorId,
    startAt: input.startAt,
    durationMin: input.durationMin,
    capacity: input.capacity,
    locked: false,
    status: "active",
    createdAt: atTime,
    changes: [],
  };
}

export function canEditDirectly(session: Session): boolean {
  return !session.locked && session.status === "active";
}

/** 督导锁定 / 解锁场次 */
export function setLocked(session: Session, locked: boolean): Session {
  return { ...session, locked };
}
