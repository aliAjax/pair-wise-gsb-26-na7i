// 演示种子数据：覆盖满员候补、席位退出转正、锁定组调整单等场景

import type { AppData } from "../types";
import { addHours } from "../domain/time";

export function buildSeed(now = new Date()): AppData {
  const iso = (d: Date) => d.toISOString();
  const at = (date: Date, h: number, dur = 1.5) => ({
    start: addHours(date, h),
    end: addHours(date, h + dur),
  });

  // 以本周三 19:00、本周六 10:00 为锚点生成开组时间
  const wed = new Date(now);
  wed.setDate(now.getDate() + ((3 - now.getDay() + 7) % 7 || 7));
  wed.setHours(19, 0, 0, 0);
  const sat = new Date(now);
  sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
  sat.setHours(10, 0, 0, 0);

  const counselors = [
    { id: "T1", name: "王顾问" },
    { id: "T2", name: "李顾问" },
    { id: "T3", name: "赵督导" },
  ];

  const clients = [
    { id: "C1", code: "C-042", name: "周明" },
    { id: "C2", code: "C-119", name: "陈雨" },
    { id: "C3", code: "C-203", name: "林方" },
    { id: "C4", code: "C-218", name: "高岩" },
    { id: "C5", code: "C-235", name: "许念" },
    { id: "C6", code: "C-241", name: "宋安" },
    { id: "C7", code: "C-252", name: "何苗" },
  ];

  const sessions = [
    {
      id: "G1",
      topic: "焦虑情绪管理",
      leaderId: "T1",
      capacity: 4,
      room: "团体室 A",
      status: "open" as const,
      note: "每周三晚固定组",
      ...at(wed, 0),
    },
    {
      id: "G2",
      topic: "亲密关系探索",
      leaderId: "T2",
      capacity: 3,
      room: "团体室 B",
      status: "open" as const,
      ...at(sat, 0, 2),
    },
    {
      id: "G3",
      topic: "职业压力支持（督导锁定组）",
      leaderId: "T1",
      capacity: 3,
      room: "团体室 A",
      status: "locked" as const,
      note: "赵督导锁定，变更须走调整单",
      ...at(addHoursToDate(wed, 24 * 3), 0),
    },
  ];

  const t0 = iso(new Date(now.getTime() - 2 * 24 * 3600 * 1000));
  const t = (hoursAfterT0: number) => addHours(t0, hoursAfterT0);

  const entries = [
    // G1：容量 4，4 人占席，2 人候补
    { id: "E1", sessionId: "G1", clientId: "C1", status: "confirmed" as const, joinedAt: t(0) },
    { id: "E2", sessionId: "G1", clientId: "C2", status: "confirmed" as const, joinedAt: t(1) },
    { id: "E3", sessionId: "G1", clientId: "C3", status: "confirmed" as const, joinedAt: t(2) },
    { id: "E4", sessionId: "G1", clientId: "C4", status: "confirmed" as const, joinedAt: t(3) },
    { id: "E5", sessionId: "G1", clientId: "C5", status: "waiting" as const, joinedAt: t(4) },
    { id: "E6", sessionId: "G1", clientId: "C6", status: "waiting" as const, joinedAt: t(5) },
    // G2：3 人占席，1 人候补
    { id: "E7", sessionId: "G2", clientId: "C2", status: "confirmed" as const, joinedAt: t(0.5) },
    { id: "E8", sessionId: "G2", clientId: "C4", status: "confirmed" as const, joinedAt: t(1.5) },
    { id: "E9", sessionId: "G2", clientId: "C7", status: "confirmed" as const, joinedAt: t(2.5) },
    { id: "E10", sessionId: "G2", clientId: "C1", status: "waiting" as const, joinedAt: t(6) },
    // G3（锁定）：2 人占席
    { id: "E11", sessionId: "G3", clientId: "C3", status: "confirmed" as const, joinedAt: t(1) },
    { id: "E12", sessionId: "G3", clientId: "C5", status: "confirmed" as const, joinedAt: t(2) },
  ];

  const withdrawals = [
    {
      id: "W1",
      sessionId: "G2",
      clientId: "C6",
      fromStatus: "confirmed" as const,
      reason: "出差时间冲突",
      withdrawnAt: t(10),
    },
  ];

  const adjustments = [
    {
      id: "A1",
      sessionId: "G3",
      kind: "capacity" as const,
      reason: "本周报名需求集中，申请由 3 人扩到 5 人",
      requestedBy: "王顾问",
      requestedAt: t(12),
      status: "pending" as const,
      newCapacity: 5,
      snapshot: {
        status: "locked" as const,
        capacity: 3,
        time: { start: sessions[2].start, end: sessions[2].end },
        entries: entries
          .filter((e) => e.sessionId === "G3")
          .map((e) => ({
            clientId: e.clientId,
            status: e.status,
            joinedAt: e.joinedAt,
            offeredAt: undefined as string | undefined,
          })),
      },
    },
  ];

  return {
    counselors,
    clients,
    sessions,
    entries,
    withdrawals,
    adjustments,
    now: iso(now),
  };
}

function addHoursToDate(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600 * 1000);
}
