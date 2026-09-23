// 排队规则模块：
// 1) 按提交先后报名，同一人同一时段（时段重叠）只能占一个组；
// 2) 满员进候补；退出后最早候补收到转正提醒，24 小时内未确认顺给下一位；
// 3) 退出记录留在原场次。
import { OFFER_WINDOW_MS } from "./types.js";
import type {
  AppNotification,
  AppState,
  Enrollment,
  Session,
} from "./types.js";
import {
  enrollmentsOf,
  findConflictingSessions,
  getSession,
  heldSeats,
  intervalsOverlap,
} from "./sessions.js";

export interface QueueResult {
  state: AppState;
  notifications: AppNotification[];
}

function ok(state: AppState, notifications: AppNotification[] = []): QueueResult {
  return { state, notifications };
}

function withEnrollment(state: AppState, enrollment: Enrollment): AppState {
  return {
    ...state,
    enrollments: state.enrollments.map((e) => (e.id === enrollment.id ? enrollment : e)),
  };
}

/** 来访者在有效场次中仍然占着身份的报名（正式/候补/待确认） */
export function findLiveEnrollment(
  state: AppState,
  clientName: string,
  atTime: number
): Enrollment | undefined {
  return state.enrollments.find(
    (e) =>
      e.clientName === clientName &&
      (e.status === "booked" || e.status === "waiting" || e.status === "offered") &&
      (e.status !== "offered" || (e.offerExpiresAt !== null && e.offerExpiresAt > atTime)) &&
      getSession(state, e.sessionId)?.status === "active"
  );
}

function assertCanSignUp(state: AppState, session: Session, clientName: string): string | null {
  const name = clientName.trim();
  if (!name) return "请填写来访者姓名";
  if (session.status !== "active") return "该场次已取消，不能报名";
  const holdsLiveSeat = (target: Session): boolean =>
    enrollmentsOf(state, target.id).some(
      (e) =>
        e.clientName === name &&
        (e.status === "booked" || e.status === "waiting" || e.status === "offered")
    );
  if (holdsLiveSeat(session)) return "同一时段不能重复报名该组";
  // 与所有时段重叠的其他有效场次冲突，即同一人同一时段只能占一个组
  const conflicts = findConflictingSessions(state, session.startAt, session.durationMin, session.id);
  if (conflicts.some(holdsLiveSeat)) return "同一人同一时段只能占一个组";
  return null;
}

/** 报名：先提交先排，有空位直接进正式席位，否则进候补 */
export function signUp(
  state: AppState,
  sessionId: string,
  clientName: string,
  id: string,
  atTime: number
): QueueResult {
  const session = getSession(state, sessionId);
  if (!session) throw new Error("场次不存在");
  const error = assertCanSignUp(state, session, clientName);
  if (error) throw new Error(error);

  const enrollments = enrollmentsOf(state, sessionId);
  const hasSeat = heldSeats(enrollments) < session.capacity;
  const enrollment: Enrollment = {
    id,
    sessionId,
    clientName: clientName.trim(),
    status: hasSeat ? "booked" : "waiting",
    seq: state.seq,
    requestedAt: atTime,
    offerExpiresAt: null,
    offeredAt: null,
    confirmedAt: hasSeat ? atTime : null,
    exitedAt: null,
    exitFrom: null,
    lapseReason: null,
  };
  return ok({
    ...state,
    seq: state.seq + 1,
    enrollments: [...state.enrollments, enrollment],
  });
}

/** 给候补成员发转正提醒（占住席位，24h 有效） */
function makeOffer(state: AppState, enrollment: Enrollment, atTime: number): QueueResult {
  const offered: Enrollment = {
    ...enrollment,
    status: "offered",
    offeredAt: atTime,
    offerExpiresAt: atTime + OFFER_WINDOW_MS,
  };
  const session = getSession(state, enrollment.sessionId);
  const notification: AppNotification = {
    id: `n-${offered.id}`,
    enrollmentId: offered.id,
    sessionId: offered.sessionId,
    clientName: offered.clientName,
    kind: "offer",
    message: `${offered.clientName}，《${session?.theme ?? "团体小组"}》已有空缺，请在 24 小时内确认参加，逾期资格顺给下一位候补。`,
    createdAt: atTime,
    expiresAt: atTime + OFFER_WINDOW_MS,
    read: false,
  };
  return ok(withEnrollment(state, offered), [notification]);
}

/**
 * 从候补队首开始顺补，直到空位填满或候补用完。
 * 已被提醒但超时的成员会在 sweepExpiredOffers 中先作废再调用本函数。
 */
export function promoteWaiting(state: AppState, sessionId: string, atTime: number): QueueResult {
  let next = state;
  const notifications: AppNotification[] = [];
  for (;;) {
    const session = getSession(next, sessionId);
    if (!session || session.status !== "active") break;
    const enrollments = enrollmentsOf(next, sessionId);
    if (heldSeats(enrollments) >= session.capacity) break;
    const candidate = enrollments.find((e) => e.status === "waiting");
    if (!candidate) break;
    const result = makeOffer(next, candidate, atTime);
    next = result.state;
    notifications.push(...result.notifications);
  }
  return ok(next, notifications);
}

/** 退出：正式席位或候补均可退，记录保留在原场次；空出席位顺补最早候补 */
export function exitEnrollment(
  state: AppState,
  enrollmentId: string,
  atTime: number
): QueueResult {
  const target = state.enrollments.find((e) => e.id === enrollmentId);
  if (!target) throw new Error("报名记录不存在");
  if (target.status === "exited") throw new Error("该记录已是退出状态");
  if (target.status === "lapsed") throw new Error("已作废的记录无需退出");

  const exited: Enrollment = {
    ...target,
    status: "exited",
    exitedAt: atTime,
    exitFrom: target.status === "offered" ? "offered" : target.status === "waiting" ? "waiting" : "booked",
    offerExpiresAt: null,
  };
  let next = withEnrollment(state, exited);
  const result = promoteWaiting(next, target.sessionId, atTime);
  next = result.state;
  return ok(next, result.notifications);
}

/** 候补成员在 24 小时内确认，转为正式席位 */
export function confirmOffer(
  state: AppState,
  enrollmentId: string,
  atTime: number
): QueueResult {
  const target = state.enrollments.find((e) => e.id === enrollmentId);
  if (!target) throw new Error("报名记录不存在");
  if (target.status !== "offered") throw new Error("该记录没有待确认的转正提醒");
  if (target.offerExpiresAt === null || atTime > target.offerExpiresAt) {
    throw new Error("转正提醒已超过 24 小时，资格已顺给下一位");
  }
  const session = getSession(state, target.sessionId);
  if (!session || session.status !== "active") throw new Error("场次已取消，无法确认");

  const confirmed: Enrollment = {
    ...target,
    status: "booked",
    confirmedAt: atTime,
    offerExpiresAt: null,
  };
  return ok(withEnrollment(state, confirmed));
}

/** 候补成员婉拒转正：资格作废并立即顺给下一位 */
export function declineOffer(
  state: AppState,
  enrollmentId: string,
  atTime: number
): QueueResult {
  const target = state.enrollments.find((e) => e.id === enrollmentId);
  if (!target) throw new Error("报名记录不存在");
  if (target.status !== "offered") throw new Error("该记录没有待确认的转正提醒");

  const lapsed: Enrollment = {
    ...target,
    status: "lapsed",
    lapseReason: "declined",
    offerExpiresAt: null,
  };
  let next = withEnrollment(state, lapsed);
  const result = promoteWaiting(next, target.sessionId, atTime);
  next = result.state;
  return ok(next, result.notifications);
}

/**
 * 到期扫描：把超过一天仍未确认的提醒作废（超时），并顺给下一位候补。
 * 任何会读取排队状态的入口都应先调用本函数。
 */
export function sweepExpiredOffers(state: AppState, atTime: number): QueueResult {
  let next = state;
  const notifications: AppNotification[] = [];
  const expired = next.enrollments.filter(
    (e) => e.status === "offered" && e.offerExpiresAt !== null && e.offerExpiresAt <= atTime
  );
  const touchedSessions = new Set<string>();
  for (const e of expired) {
    const lapsed: Enrollment = {
      ...e,
      status: "lapsed",
      lapseReason: "timeout",
      offerExpiresAt: null,
    };
    next = withEnrollment(next, lapsed);
    touchedSessions.add(e.sessionId);
  }
  for (const sessionId of touchedSessions) {
    const result = promoteWaiting(next, sessionId, atTime);
    next = result.state;
    notifications.push(...result.notifications);
  }
  return ok(next, notifications);
}

/** 提醒剩余有效毫秒（<=0 表示已超时） */
export function offerRemainingMs(enrollment: Enrollment, atTime: number): number | null {
  if (enrollment.status !== "offered" || enrollment.offerExpiresAt === null) return null;
  return enrollment.offerExpiresAt - atTime;
}
