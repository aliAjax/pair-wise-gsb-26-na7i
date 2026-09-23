import { useState } from "react";
import { useStore } from "../state/store.js";
import {
  countByStatus,
  enrollmentsOf,
  getCounselor,
  getSession,
} from "../domain/sessions.js";
import { offerRemainingMs } from "../domain/queue.js";
import type { Enrollment } from "../domain/types.js";
import { formatCountdown, formatDateTime, statusClass, statusLabel } from "./format.js";
import { Modal, Tag } from "./widgets.js";
import { SessionForm } from "./SessionForm.js";
import { AdjustmentForm } from "./AdjustmentForm.js";

export function SessionDetailPage({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const { state, role, now, error, enroll } = useStore();
  const session = getSession(state, sessionId);
  const [clientName, setClientName] = useState("");
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  if (!session) {
    return (
      <div className="page">
        <button className="link-btn" onClick={onBack}>
          ← 返回场次列表
        </button>
        <p className="empty-state">场次不存在或已被删除</p>
      </div>
    );
  }

  const counselor = getCounselor(state, session.counselorId);
  const roster = enrollmentsOf(state, sessionId);
  const counts = countByStatus(roster);
  const pendingAdjustments = state.adjustments.filter(
    (a) => a.sessionId === sessionId && a.status === "pending"
  );

  const doEnroll = () => {
    if (clientName.trim()) enroll(sessionId, clientName.trim());
  };

  return (
    <div className="page">
      <button className="link-btn" onClick={onBack}>
        ← 返回场次列表
      </button>

      <section className="detail-head panel">
        <div>
          <div className="tag-row">
            {session.locked && <Tag className="tag-locked">督导锁定 · 变更需调整单</Tag>}
            {session.status === "cancelled" && <Tag className="tag-lapsed">已取消（资料留档）</Tag>}
          </div>
          <h2>{session.theme}</h2>
          <p className="muted">
            开组顾问：{counselor?.name ?? "未知"} · 开组时间：{formatDateTime(session.startAt)} ·
            时长 {session.durationMin} 分钟 · 容量 {session.capacity} 人
          </p>
        </div>
        {role === "counselor" && session.status === "active" && (
          <div className="detail-actions">
            {session.locked ? (
              <button className="primary-btn" onClick={() => setAdjusting(true)}>
                提交调整单
              </button>
            ) : (
              <button onClick={() => setEditing(true)}>编辑场次</button>
            )}
          </div>
        )}
      </section>

      {session.changes.length > 0 && (
        <section className="panel">
          <h3>场次资料变更留痕</h3>
          <ul className="change-list">
            {session.changes.map((change) => (
              <li key={change.adjustmentId + change.at}>
                <span className="muted">{formatDateTime(change.at)}</span>
                <span>{change.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {role === "client" && session.status === "active" && (
        <section className="panel enroll-box">
          <h3>报名（按提交先后排队，同一时段只能占一个组）</h3>
          <div className="enroll-row">
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="输入来访者姓名"
              onKeyDown={(e) => e.key === "Enter" && doEnroll()}
            />
            <button className="primary-btn" onClick={doEnroll}>
              报名
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <EnrollFeedback clientName={clientName.trim()} sessionId={sessionId} />
        </section>
      )}

      <section className="panel">
        <div className="section-title-row">
          <h3>名单与排队（退出记录保留在原场次）</h3>
          <p className="muted">
            正式 {counts.booked} · 待确认 {counts.offered} · 候补 {counts.waiting} · 退出{" "}
            {counts.exited} · 作废 {counts.lapsed}
          </p>
        </div>
        <table className="roster-table">
          <thead>
            <tr>
              <th>次序</th>
              <th>来访者</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>转正提醒</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((e, index) => (
              <RosterRow
                key={e.id}
                enrollment={e}
                index={index + 1}
                now={now}
                cancelled={session.status === "cancelled"}
              />
            ))}
          </tbody>
        </table>
        {roster.length === 0 && <p className="empty-state">还没有人报名</p>}
      </section>

      {pendingAdjustments.length > 0 && (
        <section className="panel">
          <h3>本场次待处理调整单</h3>
          <ul className="change-list">
            {pendingAdjustments.map((a) => (
              <li key={a.id}>
                <span className="muted">{formatDateTime(a.requestedAt)} · {a.requestedBy}</span>
                <span>
                  {a.type === "cancel" ? "申请取消场次" : "申请修改资料"}：{a.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <Modal title="编辑场次" onClose={() => setEditing(false)}>
          <SessionForm session={session} onDone={() => setEditing(false)} />
        </Modal>
      )}
      {adjusting && (
        <Modal title="锁定场次调整单" onClose={() => setAdjusting(false)}>
          <AdjustmentForm session={session} onDone={() => setAdjusting(false)} />
        </Modal>
      )}
    </div>
  );
}

function EnrollFeedback({ clientName, sessionId }: { clientName: string; sessionId: string }) {
  const { state } = useStore();
  if (!clientName) return null;
  const mine = enrollmentsOf(state, sessionId).find((e) => e.clientName === clientName);
  if (!mine) return null;
  if (mine.status === "booked") return <p className="ok-text">报名成功，已占正式席位。</p>;
  if (mine.status === "waiting") {
    const ahead = enrollmentsOf(state, sessionId).filter(
      (e) => e.status === "waiting" && e.seq < mine.seq
    ).length;
    return <p className="ok-text">已进入候补，前面还有 {ahead} 人；有空缺时将按顺序发转正提醒。</p>;
  }
  return null;
}

function RosterRow({
  enrollment,
  index,
  now,
  cancelled,
}: {
  enrollment: Enrollment;
  index: number;
  now: number;
  cancelled: boolean;
}) {
  const { role, leave, acceptOffer, refuseOffer } = useStore();
  const remaining = offerRemainingMs(enrollment, now);

  return (
    <tr className={enrollment.status === "exited" || enrollment.status === "lapsed" ? "row-muted" : ""}>
      <td>{index}</td>
      <td>{enrollment.clientName}</td>
      <td>
        <Tag className={statusClass[enrollment.status]}>
          {statusLabel[enrollment.status]}
          {enrollment.status === "exited" && enrollment.exitFrom
            ? `（原${enrollment.exitFrom === "booked" ? "正式席位" : enrollment.exitFrom === "offered" ? "待确认" : "候补"}）`
            : ""}
        </Tag>
      </td>
      <td>{formatDateTime(enrollment.requestedAt)}</td>
      <td>
        {enrollment.status === "offered" && remaining !== null && (
          <span className={remaining < 60 * 60_000 ? "countdown-urgent" : "countdown"}>
            {formatCountdown(remaining)}
          </span>
        )}
        {enrollment.status === "booked" && enrollment.offeredAt && (
          <span className="muted">已于 {formatDateTime(enrollment.confirmedAt ?? enrollment.offeredAt)} 确认</span>
        )}
        {enrollment.status === "lapsed" && (
          <span className="muted">
            {enrollment.lapseReason === "timeout" ? "超时未确认，已顺给下一位" : "本人婉拒，已顺给下一位"}
          </span>
        )}
        {enrollment.status === "exited" && enrollment.exitedAt && (
          <span className="muted">{formatDateTime(enrollment.exitedAt)} 退出</span>
        )}
      </td>
      <td>
        {!cancelled && (
          <div className="row-actions">
            {role === "client" && enrollment.status === "offered" && (
              <>
                <button className="small-btn primary-btn" onClick={() => acceptOffer(enrollment.id)}>
                  确认参加
                </button>
                <button className="small-btn" onClick={() => refuseOffer(enrollment.id)}>
                  婉拒
                </button>
              </>
            )}
            {role === "client" &&
              (enrollment.status === "booked" ||
                enrollment.status === "waiting" ||
                enrollment.status === "offered") && (
                <button className="small-btn danger-btn" onClick={() => leave(enrollment.id)}>
                  退出
                </button>
              )}
            {role === "counselor" &&
              (enrollment.status === "booked" ||
                enrollment.status === "waiting" ||
                enrollment.status === "offered") && (
                <button className="small-btn danger-btn" onClick={() => leave(enrollment.id)}>
                  代为退出
                </button>
              )}
          </div>
        )}
      </td>
    </tr>
  );
}
