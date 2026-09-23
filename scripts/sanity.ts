// 领域规则端到端快速验证（不参与 tsc 编译，仅用 esbuild 临时打包后 node 运行）
import { buildSeed } from "../src/domain/seed";
import {
  acceptOffer,
  createAdjustment,
  createSession,
  declineOffer,
  enroll,
  expireDueOffers,
  reviewAdjustment,
  setLocked,
  withdraw,
} from "../src/domain/queue";
import { confirmedEntries, waitingEntries } from "../src/domain/sessions";
import { addHours } from "../src/domain/time";

let failures = 0;
let r: { data: typeof data; result: { ok: boolean; message: string } };
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

let data = buildSeed(new Date("2026-09-23T10:00:00"));
let now = data.now;

console.log("1. 报名占席与候补");
check("G1 已有 4 席", confirmedEntries(data, "G1").length === 4);
check("G1 已有 2 候补", waitingEntries(data, "G1").length === 2);
r = enroll(data, "G1", "C7", now);
check("满员场次新人进候补", r.result.ok && waitingEntries(r.data, "G1").length === 3, r.result.message);
data = r.data; // C7 成为第 3 位候补（C5、C6、C7）

console.log("2. 同一人同一时段只能占一个组");
// C1 已在 G1 在席，重复报名应被拒
r = enroll(data, "G1", "C1", now);
check("同场重复报名被拒", !r.result.ok, r.result.message);
// 新开一个与 G1 时间重叠的组，C1（G1 在席）报名应被时段冲突拦截
const g1 = data.sessions.find((s) => s.id === "G1")!;
r = (() => {
  const cr = createSession(
    data,
    { topic: "重叠测试组", leaderId: "T2", capacity: 5, room: "X", time: { start: g1.start, end: g1.end } },
    now
  );
  if (!cr.result.ok) return cr;
  const sid = cr.data.sessions[cr.data.sessions.length - 1].id;
  return { data: cr.data, result: enroll(cr.data, sid, "C1", now).result };
})();
check("重叠时段占两个组被拒", !r.result.ok && r.result.message.includes("时间冲突"), r.result.message);

console.log("3. 席位退出 → 最早候补收到提醒，一天内确认转正");
const firstWaiter = waitingEntries(data, "G1")[0]; // C5
r = withdraw(data, confirmedEntries(data, "G1")[0].id, "时间冲突", now); // C1 退出
data = r.data;
const offered = waitingEntries(data, "G1").find((e) => e.status === "offered");
check("退出后自动发出提醒", !!offered && offered.clientId === firstWaiter.clientId, r.result.message);
check("提醒有效期为 24h", !!offered.expiresAt && new Date(offered.expiresAt).getTime() - new Date(offered.offeredAt!).getTime() === 24 * 3600 * 1000);
r = acceptOffer(data, offered!.id, addHours(now, 10));
check("24h 内确认转正", r.result.ok && confirmedEntries(r.data, "G1").length === 4, r.result.message);
data = r.data;
check("确认后席位仍是 4", confirmedEntries(data, "G1").length === 4);

console.log("4. 逾期未确认 → 顺给下一位");
// 再退一个席位，提醒发给当前最早候补；快进 25 小时后应过期并顺给
r = withdraw(data, confirmedEntries(data, "G1")[0].id, "出差", now);
data = r.data;
const out1 = waitingEntries(data, "G1").find((e) => e.status === "offered")!;
check("第二次提醒已发出", !!out1);
const future = addHours(now, 25);
const swept = expireDueOffers(data, future);
data = swept.data;
check("到期顺延被处理", swept.expired === 1);
check("原候补标记 expired", data.entries.find((e) => e.id === out1.id)?.status === "expired");
const out2 = waitingEntries(data, "G1").find((e) => e.status === "offered");
check("自动顺给下一位候补", !!out2 && out2.id !== out1.id);
check("过期后本人确认被拒", !acceptOffer(data, out1.id, future).result.ok);

console.log("5. 主动放弃 → 立即顺给");
const current = out2!;
r = declineOffer(data, current.id, future);
data = r.data;
check("放弃后立即有下一位拿到提醒", waitingEntries(data, "G1").some((e) => e.status === "offered"), r.result.message);

console.log("6. 退出记录留在原场次");
check(
  "退出记录可查",
  data.withdrawals.length >= 2 && data.withdrawals.every((w) => w.sessionId === "G1" || w.sessionId === "G2")
);
check(
  "历史名单中退出条目标 withdrawn",
  data.entries.some((e) => e.sessionId === "G1" && e.status === "withdrawn")
);

console.log("7. 督导锁定组：只能走带原因调整单");
check("锁定组报名被拒", !enroll(data, "G3", "C7", now).result.ok);
check("无原因调整单被拒", !createAdjustment(data, { sessionId: "G3", kind: "capacity", reason: "", requestedBy: "王" }, now).result.ok);
r = createAdjustment(
  data,
  { sessionId: "G3", kind: "capacity", reason: "需求增加扩到 5 人", requestedBy: "王顾问", newCapacity: 5 },
  now
);
check("带原因调整单可提交", r.result.ok, r.result.message);
data = r.data;
const order = data.adjustments.find((a) => a.status === "pending" && a.sessionId === "G3" && a.id !== "A1")!;
check("调整单含原名单快照", order.snapshot.entries.length === 2 && order.snapshot.capacity === 3);
r = reviewAdjustment(data, order.id, false, "赵督导", "本周暂不扩容", now);
data = r.data;
check("驳回不变更容量", data.sessions.find((s) => s.id === "G3")!.capacity === 3);
r = reviewAdjustment(data, order.id, true, "赵督导", "同意", now);
check("已处理单不能再审", !r.result.ok);
// 种子里 A1 仍是 pending，批准它使容量 3→5
const a1 = data.adjustments.find((a) => a.id === "A1")!;
r = reviewAdjustment(data, a1.id, true, "赵督导", "", now);
data = r.data;
check("批准扩容生效（3→5）", data.sessions.find((s) => s.id === "G3")!.capacity === 5, r.result.message);

console.log("8. 锁定/解锁");
r = setLocked(data, "G1", true, now);
check("可锁定", r.result.ok);
check("锁定后开组状态为 locked", r.data.sessions.find((s) => s.id === "G1")!.status === "locked");

console.log(failures === 0 ? "\n全部规则验证通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
