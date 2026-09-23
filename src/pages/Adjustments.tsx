// 调整单页：全机构锁定组调整单汇总，督导在此统一审批

import type { AppData } from "../types";
import {
  Badge,
  EmptyState,
  adjustmentKindLabel,
} from "../components/ui";
import { formatDateTime, formatRange } from "../domain/time";
import type { Role } from "../App";
import { useState } from "react";

export function Adjustments({
  data,
  role,
  onReview,
  onOpenSession,
}: {
  data: AppData;
  role: Role;
  onReview: (orderId: string, approve: boolean, note: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const orders = [...data.adjustments].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const pending = orders.filter((o) => o.status === "pending");

  const topicOf = (id: string) => data.sessions.find((s) => s.id === id)?.topic ?? "已删除场次";
  const statusOf = (id: string) => data.sessions.find((s) => s.id === id)?.status;

  return (
    <div className="page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="hint">督导锁定的组只能另建带原因的调整单</p>
            <h2>调整单审批</h2>
          </div>
          {role === "supervisor" && pending.length > 0 && (
            <Badge tone="amber">{pending.length} 张待审批</Badge>
          )}
        </div>

        {orders.length === 0 ? (
          <EmptyState>暂无调整单。锁定场次后可在场次详情中新建。</EmptyState>
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
                    {statusOf(o.sessionId) && (
                      <Badge tone="gray">场次当前：{statusOf(o.sessionId) === "locked" ? "锁定" : statusOf(o.sessionId) === "open" ? "开放" : "取消"}</Badge>
                    )}
                  </div>
                  <span className="order-time">{formatDateTime(o.requestedAt)}</span>
                </div>

                <h3 className="order-topic">
                  <button className="link-btn" onClick={() => onOpenSession(o.sessionId)}>
                    {topicOf(o.sessionId)}
                  </button>
                </h3>
                <p className="order-reason">
                  <strong>调整原因：</strong>
                  {o.reason}
                </p>
                <div className="order-detail">
                  {o.kind === "capacity" && (
                    <span>
                      容量 {o.snapshot.capacity} → {o.newCapacity} 人
                    </span>
                  )}
                  {o.kind === "schedule" && (
                    <span>
                      时间 {formatRange(o.snapshot.time)} →{" "}
                      {o.newTime ? formatRange(o.newTime) : "—"}
                    </span>
                  )}
                  {o.kind === "cancel" && <span>取消该场次（原席位与名单保留可查）</span>}
                  <span>
                    提单人：{o.requestedBy}
                    {o.reviewedBy ? ` · 督导：${o.reviewedBy} · ${formatDateTime(o.reviewedAt!)}` : ""}
                  </span>
                </div>
                {o.reviewNote && <p className="order-note">审批意见：{o.reviewNote}</p>}

                {o.status === "pending" && role === "supervisor" && (
                  <ReviewRow
                    onReview={(approve, note) => onReview(o.id, approve, note)}
                  />
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewRow({
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
          批准并生效
        </button>
        <button className="small-btn danger" onClick={() => onReview(false, note)}>
          驳回
        </button>
      </div>
    </div>
  );
}
