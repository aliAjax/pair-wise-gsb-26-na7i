// 调整单模块：
// 督导锁定的场次不能直接改/取消，只能另建带原因的调整单；
// 督导批准后变更才生效，原席位与名单（含退出记录）继续保留可查。
import type {
  Adjustment,
  AdjustmentPayload,
  AdjustmentType,
  AppState,
  Session,
} from "./types.js";
import { canEditDirectly, enrollmentsOf, getSession, heldSeats } from "./sessions.js";
import { promoteWaiting } from "./queue.js";

export interface NewAdjustmentInput {
  type: AdjustmentType;
  reason: string;
  payload?: AdjustmentPayload;
}

function requireAdjustable(session: Session | undefined): asserts session is Session {
  if (!session) throw new Error("场次不存在");
  if (canEditDirectly(session)) {
    throw new Error("该场次未锁定，无需提交调整单，可直接编辑");
  }
  if (session.status !== "active") throw new Error("该场次已取消，不能再提调整单");
}

/** 创建带原因的调整单（仅对督导锁定场次开放） */
export function createAdjustment(
  state: AppState,
  sessionId: string,
  input: NewAdjustmentInput,
  id: string,
  requestedBy: string,
  atTime: number
): Adjustment {
  const session = getSession(state, sessionId);
  requireAdjustable(session);
  if (!input.reason.trim()) throw new Error("调整单必须填写原因");

  if (input.type === "edit") {
    const p = input.payload ?? {};
    if (p.theme !== undefined && !p.theme.trim()) throw new Error("新主题不能为空");
    if (p.startAt !== undefined && (!Number.isFinite(p.startAt) || p.startAt <= 0)) {
      throw new Error("新开组时间无效");
    }
    if (p.durationMin !== undefined && (!Number.isInteger(p.durationMin) || p.durationMin <= 0)) {
      throw new Error("新时长必须为正整数（分钟）");
    }
    if (p.capacity !== undefined) {
      if (!Number.isInteger(p.capacity) || p.capacity <= 0) throw new Error("新容量必须为正整数");
      const booked = heldSeats(enrollmentsOf(state, sessionId));
      if (p.capacity < booked) {
        throw new Error(`新容量不能低于当前已占席位（${booked} 个）`);
      }
    }
    if (p.theme === undefined && p.startAt === undefined && p.durationMin === undefined && p.capacity === undefined) {
      throw new Error("调整单至少包含一项变更内容");
    }
  }

  return {
    id,
    sessionId,
    type: input.type,
    reason: input.reason.trim(),
    payload: input.type === "edit" ? input.payload ?? {} : {},
    status: "pending",
    requestedBy,
    requestedAt: atTime,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  };
}

function describeChange(session: Session, payload: AdjustmentPayload): string {
  const parts: string[] = [];
  if (payload.theme && payload.theme !== session.theme) parts.push(`主题「${session.theme}」→「${payload.theme}」`);
  if (payload.startAt && payload.startAt !== session.startAt) {
    parts.push(`开组时间调整为 ${new Date(payload.startAt).toLocaleString("zh-CN")}`);
  }
  if (payload.durationMin && payload.durationMin !== session.durationMin) {
    parts.push(`时长 ${session.durationMin}→${payload.durationMin} 分钟`);
  }
  if (payload.capacity && payload.capacity !== session.capacity) {
    parts.push(`容量 ${session.capacity}→${payload.capacity} 人`);
  }
  return parts.length ? parts.join("；") : "资料更新（内容未变化）";
}

/** 督导批准：变更落到原场次上，名单与席位保持不变（扩容时顺带顺补候补） */
export function approveAdjustment(
  state: AppState,
  adjustmentId: string,
  reviewedBy: string,
  atTime: number,
  reviewNote = ""
): AppState {
  const adj = state.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) throw new Error("调整单不存在");
  if (adj.status !== "pending") throw new Error("该调整单已处理");
  const session = getSession(state, adj.sessionId);
  if (!session) throw new Error("对应场次不存在");

  const reviewed: Adjustment = {
    ...adj,
    status: "approved",
    reviewedBy,
    reviewedAt: atTime,
    reviewNote: reviewNote.trim() || null,
  };

  let next: AppState = {
    ...state,
    adjustments: state.adjustments.map((a) => (a.id === adj.id ? reviewed : a)),
  };

  if (adj.type === "cancel") {
    const cancelled: Session = {
      ...session,
      status: "cancelled",
      changes: [
        ...session.changes,
        { at: atTime, adjustmentId: adj.id, summary: `经调整单批准取消（原因：${adj.reason}）` },
      ],
    };
    next = { ...next, sessions: next.sessions.map((s) => (s.id === session.id ? cancelled : s)) };
    return next;
  }

  const p = adj.payload;
  const summary = describeChange(session, p);
  const updated: Session = {
    ...session,
    theme: p.theme ?? session.theme,
    startAt: p.startAt ?? session.startAt,
    durationMin: p.durationMin ?? session.durationMin,
    capacity: p.capacity ?? session.capacity,
    changes: [
      ...session.changes,
      { at: atTime, adjustmentId: adj.id, summary: `${summary}（原因：${adj.reason}）` },
    ],
  };
  next = { ...next, sessions: next.sessions.map((s) => (s.id === session.id ? updated : s)) };
  // 扩容可能空出席位，按排队规则顺补
  const promoted = promoteWaiting(next, session.id, atTime);
  return {
    ...promoted.state,
    notifications: [...promoted.state.notifications, ...promoted.notifications],
  };
}

/** 督导驳回：场次保持原样，调整单留痕 */
export function rejectAdjustment(
  state: AppState,
  adjustmentId: string,
  reviewedBy: string,
  atTime: number,
  reviewNote: string
): AppState {
  if (!reviewNote.trim()) throw new Error("驳回需要填写处理说明");
  const adj = state.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) throw new Error("调整单不存在");
  if (adj.status !== "pending") throw new Error("该调整单已处理");
  const reviewed: Adjustment = {
    ...adj,
    status: "rejected",
    reviewedBy,
    reviewedAt: atTime,
    reviewNote: reviewNote.trim(),
  };
  return {
    ...state,
    adjustments: state.adjustments.map((a) => (a.id === adj.id ? reviewed : a)),
  };
}

export function pendingAdjustments(state: AppState): Adjustment[] {
  return state.adjustments
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.requestedAt - b.requestedAt);
}
