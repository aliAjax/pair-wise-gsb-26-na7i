// 排队规则：报名、候补、转正提醒、一天确认期顺给、退出、锁定组调整
// 全部为纯函数：输入数据 + 参数，返回新数据与提示，不碰 React / localStorage

import type {
  AdjustmentKind,
  AdjustmentOrder,
  AppData,
  GroupSession,
  OpResult,
  QueueEntry,
  TimeRange,
} from "../types";
import { OFFER_WINDOW_MS, isPast, overlaps, toTime } from "./time";
import { clientActiveEntries, confirmedEntries, sessionEntries } from "./sessions";

let seq = 0;
/** 生成带时间戳的唯一 id（非加密场景够用） */
export function uid(prefix: string, now: string): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}-${toTime(now).toString(36)}-${seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function ok(message: string): OpResult {
  return { ok: true, message };
}
function fail(message: string): OpResult {
  return { ok: false, message };
}

function findSession(data: AppData, sessionId: string): GroupSession | undefined {
  return data.sessions.find((s) => s.id === sessionId);
}

/**
 * 报名：按提交先后入队。
 * 规则：
 *  - 锁定 / 取消 / 已结束场次不可报名
 *  - 同一人同一场次只能占一条有效记录
 *  - 同一人在重叠时段的其他场次已有席位或候补，则拒绝
 *  - 有剩余容量直接占席，否则进入候补
 */
export function enroll(
  data: AppData,
  sessionId: string,
  clientId: string,
  nowIso: string
): { data: AppData; result: OpResult } {
  const session = findSession(data, sessionId);
  if (!session) return { data, result: fail("场次不存在") };
  if (session.status === "cancelled") return { data, result: fail("该场次已取消") };
  if (session.status === "locked") return { data, result: fail("督导已锁定该组，请走调整单流程") };
  if (isPast(session, new Date(nowIso))) return { data, result: fail("该场次已结束") };
  if (!data.clients.some((c) => c.id === clientId)) return { data, result: fail("来访者不存在") };

  const already = sessionEntries(data, sessionId).some(
    (e) =>
      e.clientId === clientId &&
      (e.status === "confirmed" || e.status === "waiting" || e.status === "offered")
  );
  if (already) return { data, result: fail("该来访者已在此场次的名单或候补中") };

  const clash = clientActiveEntries(data, clientId).find((e) => {
    const other = findSession(data, e.sessionId);
    return other && other.status !== "cancelled" && overlaps(session, other);
  });
  if (clash) {
    const other = findSession(data, clash.sessionId)!;
    return { data, result: fail(`同一时段只能占一个组：与「${other.topic}」时间冲突`) };
  }

  const taken = confirmedEntries(data, sessionId).length;
  const seated = taken < session.capacity;
  const entry: QueueEntry = {
    id: uid("q", nowIso),
    sessionId,
    clientId,
    status: seated ? "confirmed" : "waiting",
    joinedAt: nowIso,
  };
  if (!seated) {
    const waitPosition =
      data.entries.filter(
        (e) => e.sessionId === sessionId && (e.status === "waiting" || e.status === "offered")
      ).length + 1;
    return {
      data: { ...data, entries: [...data.entries, entry] },
      result: ok(`场次已满，已登记为候补第 ${waitPosition} 位`),
    };
  }
  return {
    data: { ...data, entries: [...data.entries, entry] },
    result: ok("报名成功，已占席位"),
  };
}

/** 发出转正提醒：有缺额且没有待确认提醒时，给最早候补发提醒（24h 内确认）。
 * 若候选人因时段冲突无法转正（其在其他重叠场次已占席），跳过顺给下一位。
 */
export function sendOffer(
  data: AppData,
  sessionId: string,
  nowIso: string
): { data: AppData; result: OpResult } {
  const session = findSession(data, sessionId);
  if (!session) return { data, result: fail("场次不存在") };

  const confirmed = confirmedEntries(data, sessionId).length;
  if (confirmed >= session.capacity) return { data, result: fail("席位已满，无需转正") };
  const offerOut = data.entries.some((e) => e.sessionId === sessionId && e.status === "offered");
  if (offerOut) return { data, result: fail("已有转正提醒待确认") };

  let working = data;
  // 顺给顺序：从未拿过提醒的候补按报名先后优先；逾期/放弃过的人排到队尾，
  // 按其上次轮空（decidedAt）时间重新排队，避免刚过期又立刻拿回提醒。
  const rank = (e: QueueEntry): number => (e.status === "waiting" ? 0 : 1);
  const requeueAt = (e: QueueEntry): string => e.decidedAt ?? e.joinedAt;
  const candidates = data.entries
    .filter(
      (e) =>
        e.sessionId === sessionId &&
        (e.status === "waiting" || e.status === "expired" || e.status === "declined")
    )
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const keyA = rank(a) === 0 ? a.joinedAt : requeueAt(a);
      const keyB = rank(b) === 0 ? b.joinedAt : requeueAt(b);
      return keyA.localeCompare(keyB);
    });

  for (const candidate of candidates) {
    const clash = clientActiveEntries(working, candidate.clientId).find((e) => {
      if (e.sessionId === sessionId) return false;
      const other = findSession(working, e.sessionId);
      return other && other.status !== "cancelled" && overlaps(session, other);
    });
    if (clash) continue;

    const offeredAt = nowIso;
    working = {
      ...working,
      entries: working.entries.map((e) =>
        e.id === candidate.id
          ? { ...e, status: "offered" as const, offeredAt, expiresAt: new Date(toTime(offeredAt) + OFFER_WINDOW_MS).toISOString(), decidedAt: undefined }
          : e
      ),
    };
    return { data: working, result: ok("已向最早候补发出转正提醒，24 小时内确认") };
  }
  return { data, result: fail("候补成员均与其他场次时间冲突，暂无可顺给人选") };
}

/** 候补确认转正：必须在一天确认期内 */
export function acceptOffer(
  data: AppData,
  entryId: string,
  nowIso: string
): { data: AppData; result: OpResult } {
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry) return { data, result: fail("报名记录不存在") };
  if (entry.status !== "offered") return { data, result: fail("该记录没有待确认的转正提醒") };
  if (toTime(nowIso) > toTime(entry.expiresAt!)) return { data, result: fail("已超过一天确认期") };

  const session = findSession(data, entry.sessionId)!;
  const clash = clientActiveEntries(data, entry.clientId).find((e) => {
    if (e.id === entry.id) return false;
    const other = findSession(data, e.sessionId);
    return other && other.status !== "cancelled" && overlaps(session, other);
  });
  if (clash) return { data, result: fail("与其他场次时间冲突，无法转正") };

  return {
    data: {
      ...data,
      entries: data.entries.map((e) =>
        e.id === entryId ? { ...e, status: "confirmed" as const, decidedAt: nowIso } : e
      ),
    },
    result: ok("已确认转正，占住席位"),
  };
}

/** 候补放弃本次提醒（显式拒绝，立即顺给下一位，仍保留在候补序列可再次轮上） */
export function declineOffer(
  data: AppData,
  entryId: string,
  nowIso: string
): { data: AppData; result: OpResult } {
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry || entry.status !== "offered") return { data, result: fail("没有待处理的提醒") };

  let working: AppData = {
    ...data,
    entries: data.entries.map((e) =>
      e.id === entryId ? { ...e, status: "declined" as const, decidedAt: nowIso } : e
    ),
  };
  const next = sendOffer(working, entry.sessionId, nowIso);
  working = next.data;
  return { data: working, result: ok(`已放弃，${next.result.message}`) };
}

/**
 * 时间推进：把过期未确认的提醒标为 expired（顺延），并自动给下一位发提醒。
 * 页面每次刷新/快进时间时调用。
 */
export function expireDueOffers(
  data: AppData,
  nowIso: string
): { data: AppData; expired: number } {
  const due = data.entries.filter(
    (e) => e.status === "offered" && toTime(nowIso) > toTime(e.expiresAt!)
  );
  if (due.length === 0) return { data, expired: 0 };

  let working: AppData = {
    ...data,
    entries: data.entries.map((e) =>
      e.status === "offered" && toTime(nowIso) > toTime(e.expiresAt!)
        ? { ...e, status: "expired" as const, decidedAt: nowIso }
        : e
    ),
  };
  for (const e of due) {
    // 同场次可能有多个过期（通常只有一个），逐一补发
    const stillOffered = working.entries.some(
      (x) => x.sessionId === e.sessionId && x.status === "offered"
    );
    const full =
      confirmedEntries(working, e.sessionId).length >=
      findSession(working, e.sessionId)!.capacity;
    if (!stillOffered && !full) {
      working = sendOffer(working, e.sessionId, nowIso).data;
    }
  }
  return { data: working, expired: due.length };
}

/**
 * 退出：
 *  - 席位退出：写退出记录（留在原场次），释放席位并通知最早候补
 *  - 候补退出：写退出记录，移除排队占用
 */
export function withdraw(
  data: AppData,
  entryId: string,
  reason: string,
  nowIso: string
): { data: AppData; result: OpResult } {
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry) return { data, result: fail("报名记录不存在") };
  if (entry.status !== "confirmed" && entry.status !== "waiting" && entry.status !== "offered") {
    return { data, result: fail("该记录当前不在席位或候补中") };
  }

  const fromStatus = entry.status;
  let working: AppData = {
    ...data,
    entries: data.entries.map((e) =>
      e.id === entryId ? { ...e, status: "withdrawn" as const, decidedAt: nowIso } : e
    ),
    withdrawals: [
      ...data.withdrawals,
      {
        id: uid("w", nowIso),
        sessionId: entry.sessionId,
        clientId: entry.clientId,
        fromStatus,
        reason: reason.trim() || "未填写原因",
        withdrawnAt: nowIso,
      },
    ],
  };

  if (fromStatus === "confirmed") {
    const offered = sendOffer(working, entry.sessionId, nowIso);
    working = offered.data;
    return { data: working, result: ok(`退出记录已留存，${offered.result.message}`) };
  }
  return { data: working, result: ok("已退出，退出记录留在原场次") };
}

/** 新建场次（顾问每周开组：主题、容量、开组时间） */
export function createSession(
  data: AppData,
  input: {
    topic: string;
    leaderId: string;
    capacity: number;
    time: TimeRange;
    room: string;
    note?: string;
  },
  nowIso: string
): { data: AppData; result: OpResult } {
  if (!input.topic.trim()) return { data, result: fail("请填写主题") };
  if (!data.counselors.some((c) => c.id === input.leaderId))
    return { data, result: fail("请选择带组顾问") };
  if (!Number.isInteger(input.capacity) || input.capacity < 1)
    return { data, result: fail("容量必须是正整数") };
  if (toTime(input.time.end) <= toTime(input.time.start))
    return { data, result: fail("结束时间必须晚于开始时间") };

  const session: GroupSession = {
    id: uid("g", nowIso),
    topic: input.topic.trim(),
    leaderId: input.leaderId,
    capacity: input.capacity,
    start: input.time.start,
    end: input.time.end,
    room: input.room.trim() || "待定",
    status: "open",
    note: input.note?.trim() || undefined,
  };
  return { data: { ...data, sessions: [...data.sessions, session] }, result: ok("小组场次已开出") };
}

/** 督导锁定 / 解锁场次（锁定后只能走调整单） */
export function setLocked(
  data: AppData,
  sessionId: string,
  locked: boolean,
  _nowIso: string
): { data: AppData; result: OpResult } {
  const session = findSession(data, sessionId);
  if (!session) return { data, result: fail("场次不存在") };
  if (session.status === "cancelled") return { data, result: fail("场次已取消") };
  return {
    data: {
      ...data,
      sessions: data.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: locked ? "locked" : "open" } : s
      ),
    },
    result: locked ? ok("已锁定，后续变更需提交调整单") : ok("已解锁"),
  };
}

function snapshotSession(data: AppData, session: GroupSession): AdjustmentOrder["snapshot"] {
  return {
    status: session.status,
    capacity: session.capacity,
    time: { start: session.start, end: session.end },
    entries: sessionEntries(data, session.id).map((e) => ({
      clientId: e.clientId,
      status: e.status,
      joinedAt: e.joinedAt,
      offeredAt: e.offeredAt,
    })),
  };
}

/**
 * 锁定组只能另建带原因的调整单（调容量 / 调时间 / 取消）。
 * 调时间会校验现有成员是否与其他场次冲突，冲突仍可提单，但在结果中提示。
 */
export function createAdjustment(
  data: AppData,
  input: {
    sessionId: string;
    kind: AdjustmentKind;
    reason: string;
    requestedBy: string;
    newCapacity?: number;
    newTime?: TimeRange;
  },
  nowIso: string
): { data: AppData; result: OpResult } {
  const session = findSession(data, input.sessionId);
  if (!session) return { data, result: fail("场次不存在") };
  if (session.status !== "locked") return { data, result: fail("只有锁定的组需要走调整单") };
  if (!input.reason.trim()) return { data, result: fail("调整单必须填写原因") };
  if (input.kind === "capacity" && (!input.newCapacity || input.newCapacity < 1))
    return { data, result: fail("请填写调整后的容量（正整数）") };
  if (
    input.kind === "schedule" &&
    (!input.newTime || toTime(input.newTime.end) <= toTime(input.newTime.start))
  )
    return { data, result: fail("请填写有效的调整后时间") };

  let warning = "";
  if (input.kind === "schedule") {
    const conflictClients = confirmedEntries(data, session.id)
      .map((e) => data.clients.find((c) => c.id === e.clientId))
      .filter((c) => {
        if (!c) return false;
        return clientActiveEntries(data, c.id).some((e) => {
          if (e.sessionId === session.id) return false;
          const other = findSession(data, e.sessionId);
          return other && other.status !== "cancelled" && overlaps(input.newTime!, other);
        });
      });
    if (conflictClients.length > 0) {
      warning = `；注意：${conflictClients.length} 位在册成员与新时间的其他场次冲突`;
    }
  }
  if (input.kind === "capacity" && input.newCapacity! < confirmedEntries(data, session.id).length) {
    return { data, result: fail("新容量不能小于当前在册人数") };
  }

  const order: AdjustmentOrder = {
    id: uid("a", nowIso),
    sessionId: input.sessionId,
    kind: input.kind,
    reason: input.reason.trim(),
    requestedBy: input.requestedBy,
    requestedAt: nowIso,
    status: "pending",
    newCapacity: input.kind === "capacity" ? input.newCapacity : undefined,
    newTime: input.kind === "schedule" ? input.newTime : undefined,
    snapshot: snapshotSession(data, session),
  };
  return {
    data: { ...data, adjustments: [...data.adjustments, order] },
    result: ok(`调整单已提交，等待督导审批${warning}`),
  };
}

/** 督导审批调整单：批准后变更落到场次；席位与名单快照随单保留 */
export function reviewAdjustment(
  data: AppData,
  orderId: string,
  approve: boolean,
  reviewer: string,
  note: string,
  nowIso: string
): { data: AppData; result: OpResult } {
  const order = data.adjustments.find((a) => a.id === orderId);
  if (!order) return { data, result: fail("调整单不存在") };
  if (order.status !== "pending") return { data, result: fail("该调整单已处理") };

  const reviewed: AdjustmentOrder = {
    ...order,
    status: approve ? "approved" : "rejected",
    reviewedBy: reviewer,
    reviewedAt: nowIso,
    reviewNote: note.trim() || undefined,
  };
  let working: AppData = {
    ...data,
    adjustments: data.adjustments.map((a) => (a.id === orderId ? reviewed : a)),
  };

  if (!approve) return { data: working, result: ok("调整单已驳回，场次维持原状") };

  const session = findSession(working, order.sessionId);
  if (!session) return { data, result: fail("场次已不存在") };

  if (order.kind === "cancel") {
    working = {
      ...working,
      sessions: working.sessions.map((s) =>
        s.id === session.id ? { ...s, status: "cancelled" } : s
      ),
    };
    return { data: working, result: ok("已批准取消，原场次席位与名单仍可查") };
  }
  if (order.kind === "capacity") {
    working = {
      ...working,
      sessions: working.sessions.map((s) =>
        s.id === session.id ? { ...s, capacity: order.newCapacity! } : s
      ),
    };
    // 容量调大产生缺额时，尝试通知候补
    const offered = sendOffer(working, session.id, nowIso);
    working = offered.data;
    return { data: working, result: ok(`容量调整已生效，${offered.result.message}`) };
  }
  working = {
    ...working,
    sessions: working.sessions.map((s) =>
      s.id === session.id
        ? { ...s, start: order.newTime!.start, end: order.newTime!.end }
        : s
    ),
  };
  return { data: working, result: ok("时间调整已生效，原名单快照随调整单可查") };
}
