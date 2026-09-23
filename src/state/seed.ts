// 演示种子数据：首次进入时构造一批场次、报名与一张待处理调整单
import type {
  Adjustment,
  AppState,
  Counselor,
  Enrollment,
  Session,
} from "../domain/types.js";

const BASE = new Date(2026, 8, 24, 10, 0, 0, 0).getTime(); // 2026-09-24 10:00 本地时间
const HOUR = 60 * 60 * 1000;

interface EnrollmentSeed {
  id: string;
  clientName: string;
  status: Enrollment["status"];
  requestedOffsetMin: number;
  offeredOffsetMin?: number;
  lapseReason?: Enrollment["lapseReason"];
  exitOffsetMin?: number;
  exitFrom?: Enrollment["exitFrom"];
}

function buildEnrollment(sessionId: string, seed: EnrollmentSeed, seqStart: number): Enrollment {
  const requestedAt = BASE + seed.requestedOffsetMin * 60_000;
  const offeredAt = seed.offeredOffsetMin !== undefined ? BASE + seed.offeredOffsetMin * 60_000 : null;
  return {
    id: seed.id,
    sessionId,
    clientName: seed.clientName,
    status: seed.status,
    seq: seqStart,
    requestedAt,
    offeredAt,
    offerExpiresAt: offeredAt !== null ? offeredAt + 24 * HOUR : null,
    confirmedAt:
      seed.status === "booked"
        ? offeredAt !== null
          ? offeredAt
          : requestedAt
        : null,
    exitedAt: seed.exitOffsetMin !== undefined ? BASE + seed.exitOffsetMin * 60_000 : null,
    exitFrom: seed.exitFrom ?? null,
    lapseReason: seed.lapseReason ?? null,
  };
}

export function buildSeedState(): AppState {
  const counselors: Counselor[] = [
    { id: "c1", name: "林顾问" },
    { id: "c2", name: "周顾问" },
  ];

  const sessions: Session[] = [
    {
      id: "s1",
      theme: "焦虑情绪调节小组",
      counselorId: "c1",
      startAt: BASE + 1 * 24 * HOUR,
      durationMin: 90,
      capacity: 3,
      locked: false,
      status: "active",
      createdAt: BASE - 3 * 24 * HOUR,
      changes: [],
    },
    {
      id: "s2",
      theme: "亲密关系沟通小组",
      counselorId: "c2",
      startAt: BASE + 2 * 24 * HOUR,
      durationMin: 90,
      capacity: 2,
      locked: true,
      status: "active",
      createdAt: BASE - 3 * 24 * HOUR,
      changes: [
        {
          at: BASE - 12 * HOUR,
          adjustmentId: "a0",
          summary: "督导锁定：开组时间临近，变更需走调整单",
        },
      ],
    },
    {
      id: "s3",
      theme: "职业压力管理小组",
      counselorId: "c1",
      startAt: BASE + 4 * 24 * HOUR,
      durationMin: 120,
      capacity: 2,
      locked: false,
      status: "active",
      createdAt: BASE - 2 * 24 * HOUR,
      changes: [],
    },
  ];

  // s1：2 个正式席位，王岚已退出（记录保留），赵磊收到转正提醒（距超时约 20 小时），陈晨继续候补
  const s1Seeds: EnrollmentSeed[] = [
    { id: "e1", clientName: "张悦", status: "booked", requestedOffsetMin: -2 * 24 * 60 },
    { id: "e2", clientName: "刘洋", status: "booked", requestedOffsetMin: -2 * 24 * 60 + 8 },
    {
      id: "e3",
      clientName: "王岚",
      status: "exited",
      requestedOffsetMin: -2 * 24 * 60 + 20,
      exitOffsetMin: -8 * 60,
      exitFrom: "booked",
    },
    {
      id: "e4",
      clientName: "赵磊",
      status: "offered",
      requestedOffsetMin: -2 * 24 * 60 + 35,
      offeredOffsetMin: -4 * 60,
    },
    { id: "e5", clientName: "陈晨", status: "waiting", requestedOffsetMin: -2 * 24 * 60 + 60 },
  ];

  const s2Seeds: EnrollmentSeed[] = [
    { id: "e6", clientName: "孙倩", status: "booked", requestedOffsetMin: -2 * 24 * 60 + 5 },
    { id: "e7", clientName: "周宁", status: "booked", requestedOffsetMin: -2 * 24 * 60 + 40 },
    { id: "e8", clientName: "吴桐", status: "waiting", requestedOffsetMin: -1 * 24 * 60 },
  ];

  const s3Seeds: EnrollmentSeed[] = [
    { id: "e9", clientName: "郑好", status: "booked", requestedOffsetMin: -1 * 24 * 60 + 10 },
    {
      id: "e10",
      clientName: "冯雪",
      status: "lapsed",
      requestedOffsetMin: -1 * 24 * 60 + 30,
      offeredOffsetMin: -30 * 60,
      lapseReason: "timeout",
    },
  ];

  const allSeeds = [...s1Seeds, ...s2Seeds, ...s3Seeds];
  const enrollments: Enrollment[] = allSeeds.map((seed, index) => {
    const sessionId = index < s1Seeds.length ? "s1" : index < s1Seeds.length + s2Seeds.length ? "s2" : "s3";
    return buildEnrollment(sessionId, seed, index + 1);
  });

  const offeredAt = BASE - 4 * HOUR;
  const adjustments: Adjustment[] = [
    {
      id: "a1",
      sessionId: "s2",
      type: "edit",
      reason: "顾问临时参加外部督导，申请开组时间顺延一天",
      payload: { startAt: sessions[1].startAt + 24 * HOUR },
      status: "pending",
      requestedBy: "周顾问",
      requestedAt: BASE - 2 * HOUR,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    },
  ];

  return {
    counselors,
    sessions,
    enrollments,
    notifications: [
      {
        id: "n-e4",
        enrollmentId: "e4",
        sessionId: "s1",
        clientName: "赵磊",
        kind: "offer",
        message: "赵磊，《焦虑情绪调节小组》已有空缺，请在 24 小时内确认参加，逾期资格顺给下一位候补。",
        createdAt: offeredAt,
        expiresAt: offeredAt + 24 * HOUR,
        read: false,
      },
    ],
    adjustments,
    clockOffsetMs: 0,
    seq: allSeeds.length + 1,
  };
}
