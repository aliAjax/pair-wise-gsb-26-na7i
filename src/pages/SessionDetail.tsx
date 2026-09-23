// 场次详情：席位名单、候补队列、报名/转正/退出、锁定、发起调整单、历史与退出记录

import { useMemo, useState } from "react";
import type { AppData, AdjustmentOrder, QueueEntry } from "../types";
import { historyEntries, sessionView } from "../domain/sessions";
import type { CreateAdjustmentInput } from "../state/store";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  adjustmentKindLabel,
  entryStatusClass,
  entryStatusLabel,
  groupStatusClass,
  groupStatusLabel,
} from "../components/ui";
import {
  formatDateTime,
  formatRange,
  isoToLocalInput,
  localInputToIso,
  relative,
} from "../domain/time";
import type { Role } from "../App";

type Tab = "roster" | "history" | "adjustments";

export function SessionDetail({
  data,
  now,
  sessionId,
  role,
  onBack,
  onEnroll,
  onConfirm,
  onDecline,
  onWithdraw,
  onToggleLock,
  onRequestAdjustment,
  onReviewAdjustment,
}: {
  data: AppData;
  now: Date;
  sessionId: string;
  role: Role;
  onBack: () => void;
  onEnroll: (sessionId: string, clientId: string) => void;
  onConfirm: (entryId: string) => void;
  onDecline: (entryId: string) => void;
  onWithdraw: (entryId: string, reason: string) => void;
  onToggleLock: (sessionId: string, locked: boolean) => void;
  onRequestAdjustment: (input: CreateAdjustmentInput) => void;
  onReviewAdjustment: (orderId: string, approve: boolean, note: string) => void;
}) {
  const view = sessionView(data, sessionId, now);
  const [tab, setTab] = useState<Tab>("roster");
  const [withdrawTarget, setWithdrawTarget] = useState<QueueEntry | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [clientId, setClientId] = useState("");

  const enrollableClients = useMemo(() => {
    if (!view) return [];
    const busy = new Set(
      data.entries
        .filter(
          (e) =>
            e.sessionId === sessionId &&
            (e.status === "confirmed" || e.status === "waiting" || e.status === "offered")
        )
        .map((e) => e.clientId)
    );
    return data.clients.filter((c) => !busy.has(c.id));
  }, [data, sessionId, view]);

  if (!view) {
    return (
      <div className="page">
        <button className="link-btn" onClick={onBack}>
          ← 返回列表
        </button>
        <EmptyState>场次不存在或已被删除</EmptyState>
      </div>
    );
  }

  const { session } = view;
  const locked = session.status === "locked";
  const withdrawals = data.withdrawals
    .filter((w) => w.sessionId === sessionId)
    .sort((a, b) => b.withdrawnAt.localeCompare(a.withdrawnAt));
  const orders = data.adjustments
    .filter((a) => a.sessionId === sessionId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const allEntries = historyEntries(data, sessionId);
  const clientName = (id: string) => {
    const c = data.clients.find((x) => x.id === id);
    return c ? `${c.code} ${c.name}` : id;
  };

  const doEnroll = () => {
    if (!clientId) return;
    onEnroll(sessionId, clientId);
    setClientId("");
  };

  const canOperate = !locked && session.status !== "cancelled" && !view.past;

  return (
    <div className="page">
      <button className="link-btn" onClick={onBack}>
        ← 返回场次列表
      </button>

      <section className="panel detail-head">
        <div>
          <div className="detail-badges">
            <Badge tone={groupStatusClass[session.status].replace("badge-", "")}>
              {groupStatusLabel[session.status]}
            </Badge>
            {view.past && <Badge tone="gray">已结束</Badge>}
            {view.hasOfferOut && <Badge tone="amber">有提醒待确认</Badge>}
          </div>
          <h2 className="detail-title">{session.topic}</h2>
          <p className="session-meta">{formatRange(session)}</p>
          <p className="session-meta">
            {view.leader?.name ?? "未知顾问"} · {session.room} · 容量 {session.capacity} 人
          </p>
          {session.note && <p className="session-note">{session.note}</p>}
        </div>
        <div className="detail-actions">
          {session.status !== "cancelled" && role === "supervisor" && (
            <button onClick={() => onToggleLock(sessionId, !locked)}>
              {locked ? "解锁场次" : "督导锁定"}
            </button>
          )}
          {locked && role !== "frontdesk" && (
            <button className="primary-action" onClick={() => setShowAdjust(true)}>
              新建调整单
            </button>
          )}
        </div>
      </section>

      <div className="tabs">
        {(
          [
            ["roster", "名单与候补"],
            ["history", `历史名单（${allEntries.length}）`],
            ["adjustments", `调整单（${orders.length}）`],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "roster" && (
        <>
          {canOperate && (
            <section className="panel enroll-bar">
              <div className="enroll-select">
                <Field label="来访者按提交先后报名">
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">选择来访者…</option>
                    {enrollableClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className="primary-action" disabled={!clientId} onClick={doEnroll}>
                提交报名
              </button>
              <p className="enroll-rule">
                同一人同一时段只能占一个组；
                {view.seatsLeft > 0 ? `当前剩 ${view.seatsLeft} 个席位` : "席位已满，报名直接进候补"}
              </p>
            </section>
          )}
          {locked && (
            <section className="panel notice-bar">
              督导已锁定：名单冻结，报名与退出请通过「新建调整单」说明原因，由督导审批。原席位和名单仍可在「历史名单」查看。
            </section>
          )}

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="hint">
                  席位 {view.confirmed.length}/{session.capacity}
                </p>
                <h2>在席名单</h2>
              </div>
            </div>
            {view.confirmed.length === 0 ? (
              <EmptyState>暂无在席成员</EmptyState>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>序</th>
                    <th>来访者</th>
                    <th>报名时间</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {view.confirmed.map((e, i) => (
                    <tr key={e.id}>
                      <td>{i + 1}</td>
                      <td>{clientName(e.clientId)}</td>
                      <td>{formatDateTime(e.joinedAt)}</td>
                      <td className="row-link">
                        {!locked && role !== "supervisor" && (
                          <button className="link-btn danger" onClick={() => setWithdrawTarget(e)}>
                            退出
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <div className="section-heading">
              <div>
                <p className="hint">按提交先后排队；收到提醒后一天内确认，否则顺给下一位</p>
                <h2>候补队列</h2>
              </div>
            </div>
            {view.waiting.length === 0 ? (
              <EmptyState>暂无候补</EmptyState>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>顺位</th>
                    <th>来访者</th>
                    <th>报名时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {view.waiting.map((e, i) => (
                    <tr key={e.id}>
                      <td>{i + 1}</td>
                      <td>{clientName(e.clientId)}</td>
                      <td>{formatDateTime(e.joinedAt)}</td>
                      <td>
                        <Badge tone={entryStatusClass[e.status].replace("badge-", "")}>
                          {entryStatusLabel[e.status]}
                        </Badge>
                        {e.status === "offered" && e.expiresAt && (
                          <span className="deadline">（{relative(e.expiresAt, now)}截止）</span>
                        )}
                      </td>
                      <td className="row-actions">
                        {e.status === "offered" && (
                          <>
                            <button
                              className="small-btn primary"
                              onClick={() => onConfirm(e.id)}
                              disabled={now.getTime() > new Date(e.expiresAt!).getTime()}
                            >
                              确认转正
                            </button>
                            <button className="small-btn" onClick={() => onDecline(e.id)}>
                              放弃
                            </button>
                          </>
                        )}
                        {!locked && (
                          <button className="link-btn danger" onClick={() => setWithdrawTarget(e)}>
                            退出候补
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="table-foot">
              提醒机制：有人退出释放席位时，系统自动给最早候补发出转正提醒；24 小时内未确认即标记逾期并顺给下一位，记录可在历史名单中追溯。
            </p>
          </section>
        </>
      )}

      {tab === "history" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="hint">退出记录仍留在原场次，全部名单可追溯</p>
              <h2>历史名单</h2>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>来访者</th>
                <th>报名时间</th>
                <th>当前状态</th>
                <th>提醒发出</th>
                <th>状态变更时间</th>
              </tr>
            </thead>
            <tbody>
              {allEntries.map((e) => (
                <tr key={e.id} className={e.status === "confirmed" ? "" : "row-muted"}>
                  <td>{clientName(e.clientId)}</td>
                  <td>{formatDateTime(e.joinedAt)}</td>
                  <td>
                    <Badge tone={entryStatusClass[e.status].replace("badge-", "")}>
                      {entryStatusLabel[e.status]}
                    </Badge>
                  </td>
                  <td>{e.offeredAt ? formatDateTime(e.offeredAt) : "—"}</td>
                  <td>{e.decidedAt ? formatDateTime(e.decidedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="subhead">退出记录</h3>
          {withdrawals.length === 0 ? (
            <EmptyState>暂无退出记录</EmptyState>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>来访者</th>
                  <th>退出时身份</th>
                  <th>原因</th>
                  <th>退出时间</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>{clientName(w.clientId)}</td>
                    <td>{entryStatusLabel[w.fromStatus]}</td>
                    <td>{w.reason}</td>
                    <td>{formatDateTime(w.withdrawnAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "adjustments" && (
        <AdjustmentsTab
          orders={orders}
          role={role}
          clientName={clientName}
          onReview={onReviewAdjustment}
        />
      )}

      {withdrawTarget && (
        <Modal title="退出登记" onClose={() => setWithdrawTarget(null)}>
          <WithdrawForm
            entry={withdrawTarget}
            clientName={clientName(withdrawTarget.clientId)}
            onCancel={() => setWithdrawTarget(null)}
            onSubmit={(reason) => {
              onWithdraw(withdrawTarget.id, reason);
              setWithdrawTarget(null);
            }}
          />
        </Modal>
      )}

      {showAdjust && (
        <Modal title="锁定组调整单" onClose={() => setShowAdjust(false)}>
          <AdjustForm
            data={data}
            sessionId={sessionId}
            onClose={() => setShowAdjust(false)}
            onSubmit={(input) => {
              onRequestAdjustment(input);
              setShowAdjust(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function WithdrawForm({
  entry,
  clientName,
  onSubmit,
  onCancel,
}: {
  entry: QueueEntry;
  clientName: string;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div>
      <p className="form-intro">
        为 <strong>{clientName}</strong> 登记退出（当前身份：{entryStatusLabel[entry.status]}）。
        退出后记录仍保留在原场次；如为席位退出将自动通知最早候补。
      </p>
      <Field label="退出原因">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="如：时间冲突、身体原因…"
        />
      </Field>
      <div className="modal-actions">
        <button onClick={onCancel}>取消</button>
        <button className="danger-action" onClick={() => onSubmit(reason)}>
          确认退出
        </button>
      </div>
    </div>
  );
}

function AdjustForm({
  data,
  sessionId,
  onClose,
  onSubmit,
}: {
  data: AppData;
  sessionId: string;
  onClose: () => void;
  onSubmit: (input: CreateAdjustmentInput) => void;
}) {
  const session = data.sessions.find((s) => s.id === sessionId)!;
  const [kind, setKind] = useState<"capacity" | "schedule" | "cancel">("capacity");
  const [reason, setReason] = useState("");
  const [newCapacity, setNewCapacity] = useState(session.capacity + 2);
  const [start, setStart] = useState(isoToLocalInput(session.start));
  const [end, setEnd] = useState(isoToLocalInput(session.end));

  const submit = () =>
    onSubmit({
      sessionId,
      kind,
      reason,
      newCapacity: kind === "capacity" ? Number(newCapacity) : undefined,
      newTime:
        kind === "schedule"
          ? { start: localInputToIso(start), end: localInputToIso(end) }
          : undefined,
    });

  return (
    <div>
      <p className="form-intro">
        锁定组不能直接修改，请选择调整类型并填写原因，提交督导审批。
      </p>
      <div className="form-grid">
        <Field label="调整类型">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="capacity">调整容量</option>
            <option value="schedule">调整开组时间</option>
            <option value="cancel">取消场次</option>
          </select>
        </Field>
        {kind === "capacity" && (
          <Field label={`新容量（当前 ${session.capacity} 人）`}>
            <input
              type="number"
              min={1}
              value={newCapacity}
              onChange={(e) => setNewCapacity(Number(e.target.value))}
            />
          </Field>
        )}
        {kind === "schedule" && (
          <>
            <Field label="新开组时间">
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="新结束时间">
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </>
        )}
        <div className="form-wide">
          <Field label="调整原因（必填）">
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：顾问档期变动、报名需求增加…"
            />
          </Field>
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary-action" onClick={submit} disabled={!reason.trim()}>
          提交调整单
        </button>
      </div>
    </div>
  );
}

function AdjustmentsTab({
  orders,
  role,
  clientName,
  onReview,
}: {
  orders: AdjustmentOrder[];
  role: Role;
  clientName: (id: string) => string;
  onReview: (orderId: string, approve: boolean, note: string) => void;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="hint">原席位与名单快照随单保留，审批通过后变更才生效</p>
          <h2>调整单</h2>
        </div>
      </div>
      {orders.length === 0 ? (
        <EmptyState>暂无调整单</EmptyState>
      ) : (
        <div className="order-list">
          {orders.map((o) => (
            <article key={o.id} className="order-card">
              <div className="order-head">
                <div className="order-tags">
                  <Badge tone="purple">{adjustmentKindLabel[o.kind]}</Badge>
                  <Badge
                    tone={
                      o.status === "pending" ? "amber" : o.status === "approved" ? "green" : "gray"
                    }
                  >
                    {o.status === "pending" ? "待审批" : o.status === "approved" ? "已批准" : "已驳回"}
                  </Badge>
                </div>
                <span className="order-time">{formatDateTime(o.requestedAt)}</span>
              </div>
              <p className="order-reason">
                <strong>原因：</strong>
                {o.reason}
              </p>
              <div className="order-detail">
                {o.kind === "capacity" && <span>容量调整为 {o.newCapacity} 人</span>}
                {o.kind === "schedule" && o.newTime && (
                  <span>时间调整为 {formatRange(o.newTime)}</span>
                )}
                {o.kind === "cancel" && <span>申请取消该场次</span>}
                <span>
                  提单人：{o.requestedBy}
                  {o.reviewedBy ? ` · 审批：${o.reviewedBy}` : ""}
                </span>
              </div>
              {o.reviewNote && <p className="order-note">审批意见：{o.reviewNote}</p>}
              <details className="snapshot">
                <summary>查看提审时名单快照（{o.snapshot.entries.length} 人）</summary>
                <ul>
                  {o.snapshot.entries.map((e, i) => (
                    <li key={i}>
                      {clientName(e.clientId)} — {entryStatusLabel[e.status]}（报名于{" "}
                      {formatDateTime(e.joinedAt)}）
                    </li>
                  ))}
                </ul>
                <p className="snapshot-meta">
                  快照容量 {o.snapshot.capacity} 人 · {formatRange(o.snapshot.time)}
                </p>
              </details>
              {o.status === "pending" && role === "supervisor" && (
                <ReviewControls onReview={(approve, note) => onReview(o.id, approve, note)} />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewControls({
  onReview,
}: {
  onReview: (approve: boolean, note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="review-box">
      <input
        placeholder="审批意见（可选）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="review-btns">
        <button className="small-btn primary" onClick={() => onReview(true, note)}>
          批准
        </button>
        <button className="small-btn danger" onClick={() => onReview(false, note)}>
          驳回
        </button>
      </div>
    </div>
  );
}
