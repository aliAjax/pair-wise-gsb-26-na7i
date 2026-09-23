// 场次资料：在领域数据之上的只读汇总，不修改数据

import type { AppData, Client, Counselor, GroupSession, QueueEntry } from "../types";
import { isPast } from "./time";

export function counselorName(data: AppData, id: string): string {
  return data.counselors.find((c) => c.id === id)?.name ?? "未知顾问";
}

export function clientName(data: AppData, id: string): string {
  const c = data.clients.find((x) => x.id === id);
  return c ? `${c.code} ${c.name}` : "已删除来访者";
}

export function clientById(data: AppData, id: string): Client | undefined {
  return data.clients.find((c) => c.id === id);
}

export function sessionEntries(data: AppData, sessionId: string): QueueEntry[] {
  return data.entries
    .filter((e) => e.sessionId === sessionId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/** 占席位名单（按报名先后） */
export function confirmedEntries(data: AppData, sessionId: string): QueueEntry[] {
  return sessionEntries(data, sessionId)
    .filter((e) => e.status === "confirmed")
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/** 候补队列：waiting 在前，offered 紧随，均按报名先后 */
export function waitingEntries(data: AppData, sessionId: string): QueueEntry[] {
  return sessionEntries(data, sessionId)
    .filter((e) => e.status === "waiting" || e.status === "offered")
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/** 该场次全部历史条目（含退出、过期等），原名单继续可查 */
export function historyEntries(data: AppData, sessionId: string): QueueEntry[] {
  return sessionEntries(data, sessionId);
}

export interface SessionView {
  session: GroupSession;
  leader: Counselor | undefined;
  confirmed: QueueEntry[];
  waiting: QueueEntry[];
  seatsLeft: number;
  hasOfferOut: boolean;
  past: boolean;
}

export function sessionView(data: AppData, sessionId: string, now: Date): SessionView | undefined {
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) return undefined;
  const confirmed = confirmedEntries(data, sessionId);
  const waiting = waitingEntries(data, sessionId);
  return {
    session,
    leader: data.counselors.find((c) => c.id === session.leaderId),
    confirmed,
    waiting,
    seatsLeft: session.capacity - confirmed.length,
    hasOfferOut: waiting.some((e) => e.status === "offered"),
    past: isPast(session, now),
  };
}

export function allSessionViews(data: AppData, now: Date): SessionView[] {
  return data.sessions
    .map((s) => sessionView(data, s.id, now)!)
    .sort((a, b) => a.session.start.localeCompare(b.session.start));
}

/** 来访者在哪些场次持有席位或待处理候补（用于时段冲突校验） */
export function clientActiveEntries(data: AppData, clientId: string): QueueEntry[] {
  return data.entries.filter(
    (e) =>
      e.clientId === clientId &&
      (e.status === "confirmed" || e.status === "waiting" || e.status === "offered")
  );
}
