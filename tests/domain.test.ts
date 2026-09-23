import test from "node:test";
import assert from "node:assert/strict";
import type { AppState, Enrollment, Session } from "../src/domain/types.js";
import { OFFER_WINDOW_MS } from "../src/domain/types.js";
import {
  createSession,
  heldSeats,
  intervalsOverlap,
} from "../src/domain/sessions.js";
import {
  confirmOffer,
  declineOffer,
  exitEnrollment,
  signUp,
  sweepExpiredOffers,
} from "../src/domain/queue.js";
import {
  approveAdjustment,
  createAdjustment,
  rejectAdjustment,
} from "../src/domain/adjustments.js";

const T = 1_000_000_000_000;
const HOUR = 60 * 60_000;

function emptyState(): AppState {
  return {
    counselors: [{ id: "c1", name: "林顾问" }],
    sessions: [],
    enrollments: [],
    notifications: [],
    adjustments: [],
    clockOffsetMs: 0,
    seq: 1,
  };
}

function addSession(
  state: AppState,
  id: string,
  capacity: number,
  startAt = T + 2 * 24 * HOUR,
  durationMin = 90,
  locked = false
): AppState {
  const session: Session = createSession(
    state,
    { theme: `小组-${id}`, counselorId: "c1", startAt, durationMin, capacity },
    id,
    T
  );
  return { ...state, sessions: [...state.sessions, { ...session, locked }] };
}

function enroll(
  state: AppState,
  sessionId: string,
  name: string,
  at: number
): AppState {
  const result = signUp(state, sessionId, name, `e-${state.seq}`, at);
  assert.equal(result.notifications.length, 0);
  return result.state;
}

function statuses(state: AppState, sessionId: string): string[] {
  return state.enrollments
    .filter((e) => e.sessionId === sessionId)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => `${e.clientName}:${e.status}`);
}

function findByClient(state: AppState, name: string): Enrollment {
  const e = state.enrollments.find((x) => x.clientName === name);
  if (!e) throw new assert.AssertionError({ message: `报名记录 ${name} 应存在` });
  return e;
}

test("满员后按提交先后进入候补", () => {
  let s = emptyState();
  s = addSession(s, "s1", 2);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);
  s = enroll(s, "s1", "丙", T + 3 * HOUR);
  s = enroll(s, "s1", "丁", T + 4 * HOUR);
  assert.deepEqual(statuses(s, "s1"), [
    "甲:booked",
    "乙:booked",
    "丙:waiting",
    "丁:waiting",
  ]);
});

test("正式席位退出后，最早候补收到 24 小时有效提醒并占住席位", () => {
  let s = emptyState();
  s = addSession(s, "s1", 2);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);
  s = enroll(s, "s1", "丙", T + 3 * HOUR);
  s = enroll(s, "s1", "丁", T + 4 * HOUR);

  const exited = exitEnrollment(s, findByClient(s, "甲").id, T + 5 * HOUR);
  s = {
    ...exited.state,
    notifications: [...s.notifications, ...exited.notifications],
  };

  assert.equal(exited.notifications.length, 1, "应只提醒队首候补丙，不提醒丁");
  assert.equal(exited.notifications[0].clientName, "丙");
  assert.equal(exited.notifications[0].expiresAt - exited.notifications[0].createdAt, OFFER_WINDOW_MS);
  assert.deepEqual(statuses(s, "s1"), [
    "甲:exited",
    "乙:booked",
    "丙:offered",
    "丁:waiting",
  ]);
  // offered 也占席位，不会超额
  const session = s.sessions.find((x) => x.id === "s1")!;
  assert.equal(heldSeats(s.enrollments.filter((e) => e.sessionId === "s1")), session.capacity);
  // 退出记录保留在原场次
  const exitedRecord = findByClient(s, "甲");
  assert.equal(exitedRecord.status, "exited");
  assert.equal(exitedRecord.exitFrom, "booked");
});

test("24 小时内确认即转正；超时未确认自动顺给下一位", () => {
  let s = emptyState();
  s = addSession(s, "s1", 1);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);
  s = enroll(s, "s1", "丙", T + 3 * HOUR);

  let r = exitEnrollment(s, findByClient(s, "甲").id, T + 10 * HOUR);
  s = r.state;
  assert.equal(findByClient(s, "乙").status, "offered");

  // 乙在期限内确认
  r = confirmOffer(s, findByClient(s, "乙").id, T + 12 * HOUR);
  s = r.state;
  assert.equal(findByClient(s, "乙").status, "booked");
  assert.equal(findByClient(s, "丙").status, "waiting");

  // 乙又退出 → 丙收到提醒
  r = exitEnrollment(s, findByClient(s, "乙").id, T + 20 * HOUR);
  s = r.state;
  assert.equal(findByClient(s, "丙").status, "offered");

  // 丙超时未确认
  const offeredAt = findByClient(s, "丙").offeredAt!;
  const sweep = sweepExpiredOffers(s, offeredAt + OFFER_WINDOW_MS + 1);
  s = sweep.state;
  assert.equal(findByClient(s, "丙").status, "lapsed");
  assert.equal(findByClient(s, "丙").lapseReason, "timeout");
  // 没有更多候补，空位保留
  const session = s.sessions.find((x) => x.id === "s1")!;
  assert.equal(heldSeats(s.enrollments.filter((e) => e.sessionId === "s1")), 0);
});

test("到期扫描在有下一位候补时自动顺延提醒", () => {
  let s = emptyState();
  s = addSession(s, "s1", 1);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);
  s = enroll(s, "s1", "丙", T + 3 * HOUR);
  let r = exitEnrollment(s, findByClient(s, "甲").id, T + 10 * HOUR);
  s = r.state;

  const offeredAt = findByClient(s, "乙").offeredAt!;
  const sweep = sweepExpiredOffers(s, offeredAt + OFFER_WINDOW_MS + HOUR);
  s = sweep.state;
  assert.equal(findByClient(s, "乙").status, "lapsed");
  assert.equal(findByClient(s, "丙").status, "offered");
  assert.equal(sweep.notifications.length, 1);
  assert.equal(sweep.notifications[0].clientName, "丙");

  // 超过丙自己的期限再确认应被拒绝
  const bingExpiry = findByClient(s, "丙").offerExpiresAt!;
  assert.throws(
    () => confirmOffer(s, findByClient(s, "丙").id, bingExpiry + HOUR),
    /超过 24 小时/
  );
});

test("婉拒立即顺给下一位候补", () => {
  let s = emptyState();
  s = addSession(s, "s1", 1);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);
  s = enroll(s, "s1", "丙", T + 3 * HOUR);
  let r = exitEnrollment(s, findByClient(s, "甲").id, T + 10 * HOUR);
  s = r.state;
  r = declineOffer(s, findByClient(s, "乙").id, T + 11 * HOUR);
  s = r.state;
  assert.equal(findByClient(s, "乙").status, "lapsed");
  assert.equal(findByClient(s, "乙").lapseReason, "declined");
  assert.equal(findByClient(s, "丙").status, "offered");
});

test("同一人同一时段（时段重叠）只能占一个组，跨场次拦截", () => {
  let s = emptyState();
  s = addSession(s, "s1", 5, T + 2 * 24 * HOUR, 90);
  s = addSession(s, "s2", 5, T + 2 * 24 * HOUR + 60 * 60_000, 90); // 重叠
  s = addSession(s, "s3", 5, T + 2 * 24 * HOUR + 3 * HOUR, 60); // 不重叠

  s = enroll(s, "s1", "甲", T + HOUR);
  assert.throws(() => enroll(s, "s2", "甲", T + 2 * HOUR), /同一时段/);
  // 候补状态同样占住时段资格：s4 容量 1，乙在其中候补；s2 与 s4 时段重叠
  const s4: Session = createSession(
    s,
    {
      theme: "小组-s4",
      counselorId: "c1",
      startAt: T + 2 * 24 * HOUR + 90 * 60_000,
      durationMin: 90,
      capacity: 1,
    },
    "s4",
    T
  );
  s = { ...s, sessions: [...s.sessions, s4] };
  s = enroll(s, "s4", "丁", T + 2 * HOUR);
  s = enroll(s, "s4", "乙", T + 3 * HOUR);
  assert.equal(findByClient(s, "乙").status, "waiting");
  assert.throws(() => enroll(s, "s2", "乙", T + 4 * HOUR), /同一时段/);
  // 不同时段可正常报名
  assert.doesNotThrow(() => {
    s = enroll(s, "s3", "甲", T + 3 * HOUR);
  });
});

test("时段重叠判定：相接不冲突，交叠才冲突", () => {
  const base = T;
  assert.equal(intervalsOverlap(base, 90, base + 90 * 60_000, 90), false);
  assert.equal(intervalsOverlap(base, 120, base + 90 * 60_000, 60), true);
});

test("同一场次不能重复报名", () => {
  let s = emptyState();
  s = addSession(s, "s1", 2);
  s = enroll(s, "s1", "甲", T + HOUR);
  assert.throws(() => enroll(s, "s1", "甲", T + 2 * HOUR), /重复报名/);
});

test("锁定场次只能提交带原因调整单，批准后资料变更、名单保留、扩容触发顺补", () => {
  let s = emptyState();
  s = addSession(s, "s1", 1, T + 2 * 24 * HOUR, 90, true);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);

  // 直接调整单：缺原因拒绝
  assert.throws(
    () => createAdjustment(s, "s1", { type: "cancel", reason: "   " }, "a-x", "林顾问", T),
    /原因/
  );

  const adj = createAdjustment(
    s,
    "s1",
    { type: "edit", reason: "需求增加", payload: { capacity: 3 } },
    "a1",
    "林顾问",
    T
  );
  s = { ...s, adjustments: [...s.adjustments, adj] };
  s = approveAdjustment(s, "a1", "督导", T + HOUR);

  const session = s.sessions.find((x) => x.id === "s1")!;
  assert.equal(session.capacity, 3);
  assert.equal(session.changes.length, 1);
  // 扩容后候补乙收到提醒
  assert.equal(findByClient(s, "乙").status, "offered");
  // 原记录均保留
  assert.equal(s.enrollments.length, 2);

  // 重复处理报错
  assert.throws(() => approveAdjustment(s, "a1", "督导", T + 2 * HOUR), /已处理/);
});

test("容量不能调到低于已占席位数；驳回不变更场次", () => {
  let s = emptyState();
  s = addSession(s, "s1", 2, T + 2 * 24 * HOUR, 90, true);
  s = enroll(s, "s1", "甲", T + HOUR);
  s = enroll(s, "s1", "乙", T + 2 * HOUR);
  assert.throws(
    () =>
      createAdjustment(
        s,
        "s1",
        { type: "edit", reason: "换小房间", payload: { capacity: 1 } },
        "a1",
        "林顾问",
        T
      ),
    /已占席位/
  );

  const adj = createAdjustment(
    s,
    "s1",
    { type: "edit", reason: "改主题", payload: { theme: "新的主题" } },
    "a2",
    "林顾问",
    T
  );
  s = { ...s, adjustments: [...s.adjustments, adj] };
  assert.throws(() => rejectAdjustment(s, "a2", "督导", T, "  "), /处理说明/);
  s = rejectAdjustment(s, "a2", "督导", T, "理由不充分");
  assert.equal(s.sessions[0].theme, "小组-s1");
  assert.equal(s.adjustments[0].status, "rejected");
});

test("取消场次的调整单批准后场次标记取消，原名单仍可查", () => {
  let s = emptyState();
  s = addSession(s, "s1", 2, T + 2 * 24 * HOUR, 90, true);
  s = enroll(s, "s1", "甲", T + HOUR);
  const adj = createAdjustment(s, "s1", { type: "cancel", reason: "报名不足" }, "a1", "林顾问", T);
  s = { ...s, adjustments: [...s.adjustments, adj] };
  s = approveAdjustment(s, "a1", "督导", T + HOUR);
  assert.equal(s.sessions[0].status, "cancelled");
  assert.equal(s.enrollments.filter((e) => e.sessionId === "s1").length, 1);
  // 取消场次不能再报名
  assert.throws(() => enroll(s, "s1", "乙", T + 2 * HOUR), /已取消/);
});

test("未锁定场次不允许走调整单（可直接编辑）", () => {
  const s0 = addSession(emptyState(), "s1", 2, T + 2 * 24 * HOUR, 90, false);
  assert.throws(
    () => createAdjustment(s0, "s1", { type: "cancel", reason: "有事" }, "a1", "林顾问", T),
    /未锁定/
  );
});
