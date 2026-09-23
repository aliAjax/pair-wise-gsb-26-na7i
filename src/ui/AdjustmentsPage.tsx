import { useState } from "react";
import { useStore } from "../state/store.js";
import { getSession } from "../domain/sessions.js";
import { pendingAdjustments } from "../domain/adjustments.js";
import { formatDateTime } from "./format.js";
import type { Adjustment } from "../domain/types.js";
import { EmptyState, Tag } from "./widgets.js";

export function AdjustmentsPage({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const { state, role, approve, reject } = useStore();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const pending = pendingAdjustments(state);
  const history = state.adjustments
    .filter((a) => a.status !== "pending")
    .sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));

  return (
    <div className="page">
      <section className="panel">
        <h2>调整单审批</h2>
        <p className="muted">
          督导锁定的场次不能直接改动，顾问需另建带原因的调整单；批准后变更才生效，原席位与名单继续可查。
        </p>
        {pending.length === 0 && <EmptyState text="暂无待处理调整单" />}
        <div className="adjust-list">
          {pending.map((adj) => {
            const session = getSession(state, adj.sessionId);
            return (
              <article key={adj.id} className="adjust-card">
                <header>
                  <div>
                    <h3>{session?.theme ?? "已删除场次"}</h3>
                    <p className="muted">
                      {adj.requestedBy} 于 {formatDateTime(adj.requestedAt)} 提交
                    </p>
                  </div>
                  <Tag className="tag-waiting">待审批</Tag>
                </header>
                <dl className="adjust-detail">
                  <dt>调整类型</dt>
                  <dd>{adj.type === "cancel" ? "取消场次" : "修改场次资料"}</dd>
                  <dt>调整原因</dt>
                  <dd>{adj.reason}</dd>
                  {adj.type === "edit" && (
                    <>
                      {adj.payload.theme !== undefined && adj.payload.theme !== session?.theme && (
                        <>
                          <dt>主题</dt>
                          <dd>
                            {session?.theme} → {adj.payload.theme}
                          </dd>
                        </>
                      )}
                      {adj.payload.startAt !== undefined && adj.payload.startAt !== session?.startAt && (
                        <>
                          <dt>开组时间</dt>
                          <dd>
                            {session ? formatDateTime(session.startAt) : "—"} →{" "}
                            {formatDateTime(adj.payload.startAt)}
                          </dd>
                        </>
                      )}
                      {adj.payload.durationMin !== undefined &&
                        adj.payload.durationMin !== session?.durationMin && (
                          <>
                            <dt>时长</dt>
                            <dd>
                              {session?.durationMin} → {adj.payload.durationMin} 分钟
                            </dd>
                          </>
                        )}
                      {adj.payload.capacity !== undefined &&
                        adj.payload.capacity !== session?.capacity && (
                          <>
                            <dt>容量</dt>
                            <dd>
                              {session?.capacity} → {adj.payload.capacity} 人
                            </dd>
                          </>
                        )}
                    </>
                  )}
                </dl>
                {role === "supervisor" && (
                  <div className="card-actions">
                    {noteFor === adj.id ? (
                      <div className="note-row">
                        <textarea
                          rows={2}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="驳回必填处理说明；批准时可留空"
                        />
                        <div className="row-actions">
                          <button
                            className="small-btn primary-btn"
                            onClick={() => {
                              approve(adj.id, note);
                              setNoteFor(null);
                              setNote("");
                            }}
                          >
                            确认批准
                          </button>
                          <button
                            className="small-btn danger-btn"
                            onClick={() => {
                              reject(adj.id, note);
                              setNoteFor(null);
                              setNote("");
                            }}
                          >
                            确认驳回
                          </button>
                          <button className="small-btn" onClick={() => setNoteFor(null)}>
                            收起
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button className="primary-btn" onClick={() => setNoteFor(adj.id)}>
                          批准
                        </button>
                        <button className="danger-btn" onClick={() => setNoteFor(adj.id)}>
                          驳回
                        </button>
                      </>
                    )}
                  </div>
                )}
                <button className="link-btn" onClick={() => onOpenSession(adj.sessionId)}>
                  查看原场次席位与名单 →
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>处理记录</h2>
        {history.length === 0 && <EmptyState text="还没有已处理的调整单" />}
        <ul className="change-list">
          {history.map((adj) => (
            <AdjustmentHistoryRow key={adj.id} adj={adj} onOpenSession={onOpenSession} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function AdjustmentHistoryRow({
  adj,
  onOpenSession,
}: {
  adj: Adjustment;
  onOpenSession: (id: string) => void;
}) {
  const { state } = useStore();
  const session = getSession(state, adj.sessionId);
  return (
    <li>
      <span className="muted">
        {formatDateTime(adj.reviewedAt ?? adj.requestedAt)} · {adj.reviewedBy ?? "—"}
      </span>
      <span>
        <Tag className={adj.status === "approved" ? "tag-booked" : "tag-lapsed"}>
          {adj.status === "approved" ? "已批准" : "已驳回"}
        </Tag>{" "}
        <button className="inline-link" onClick={() => onOpenSession(adj.sessionId)}>
          《{session?.theme ?? "未知场次"}》
        </button>
        （{adj.type === "cancel" ? "取消" : "改期/改资料"}）：{adj.reason}
        {adj.reviewNote && <em className="review-note"> 处理说明：{adj.reviewNote}</em>}
      </span>
    </li>
  );
}
