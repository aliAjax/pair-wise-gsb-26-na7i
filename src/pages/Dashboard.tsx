// 总览页：关键指标 + 最近场次与待处理转正提醒

import type { AppData } from "../types";
import { allSessionViews } from "../domain/sessions";
import {
  Badge,
  EmptyState,
  entryStatusClass,
  entryStatusLabel,
  groupStatusClass,
  groupStatusLabel,
} from "../components/ui";
import { formatRange, relative } from "../domain/time";

function Metric({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={`metric-bar ${tone}`} />
    </article>
  );
}

export function Dashboard({
  data,
  now,
  onOpenSession,
}: {
  data: AppData;
  now: Date;
  onOpenSession: (id: string) => void;
}) {
  const views = allSessionViews(data, now);
  const active = views.filter((v) => v.session.status !== "cancelled");
  const seatsTaken = active.reduce((sum, v) => sum + v.confirmed.length, 0);
  const waitingCount = active.reduce((sum, v) => sum + v.waiting.length, 0);
  const offersOut = data.entries.filter((e) => e.status === "offered").length;
  const pendingAdjustments = data.adjustments.filter((a) => a.status === "pending").length;

  const offeredEntries = data.entries
    .filter((e) => e.status === "offered")
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));

  const nameOf = (id: string) => {
    const c = data.clients.find((x) => x.id === id);
    return c ? `${c.code} ${c.name}` : id;
  };
  const topicOf = (id: string) => data.sessions.find((s) => s.id === id)?.topic ?? id;

  return (
    <div className="page">
      <div className="metrics-grid">
        <Metric label="进行中场次" value={active.length} tone="bar-purple" />
        <Metric label="已占席位" value={seatsTaken} tone="bar-teal" />
        <Metric label="候补人数" value={waitingCount} tone="bar-blue" />
        <Metric label="待确认提醒" value={offersOut} tone="bar-amber" />
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="hint">按开组时间排序</p>
            <h2>最近场次</h2>
          </div>
        </div>
        <div className="session-grid">
          {active.map((v) => (
            <button
              key={v.session.id}
              className="session-card"
              onClick={() => onOpenSession(v.session.id)}
            >
              <div className="session-card-top">
                <Badge tone={groupStatusClass[v.session.status].replace("badge-", "")}>
                  {groupStatusLabel[v.session.status]}
                </Badge>
                <span className="session-time">{relative(v.session.start, now)}开组</span>
              </div>
              <h3>{v.session.topic}</h3>
              <p className="session-meta">{formatRange(v.session)}</p>
              <p className="session-meta">
                {v.leader?.name ?? "未知顾问"} · {v.session.room}
              </p>
              <div className="session-card-bottom">
                <span>
                  席位 <strong>{v.confirmed.length}</strong>/{v.session.capacity}
                </span>
                <span>候补 {v.waiting.length}</span>
              </div>
            </button>
          ))}
          {active.length === 0 && <EmptyState>暂无可展示的场次</EmptyState>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <p className="hint">一天内不确认将顺给下一位候补</p>
            <h2>转正提醒待处理</h2>
          </div>
          {pendingAdjustments > 0 && (
            <Badge tone="amber">另有 {pendingAdjustments} 张调整单待督导审批</Badge>
          )}
        </div>
        {offeredEntries.length === 0 ? (
          <EmptyState>当前没有待确认的转正提醒</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>来访者</th>
                <th>场次</th>
                <th>状态</th>
                <th>确认截止</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {offeredEntries.map((e) => (
                <tr key={e.id}>
                  <td>{nameOf(e.clientId)}</td>
                  <td>{topicOf(e.sessionId)}</td>
                  <td>
                    <Badge tone={entryStatusClass[e.status].replace("badge-", "")}>
                      {entryStatusLabel[e.status]}
                    </Badge>
                  </td>
                  <td>
                    {e.expiresAt ? `${relative(e.expiresAt, now)}截止` : "—"}
                  </td>
                  <td className="row-link">
                    <button className="link-btn" onClick={() => onOpenSession(e.sessionId)}>
                      到场次处理 →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
