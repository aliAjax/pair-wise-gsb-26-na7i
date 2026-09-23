import { useStore } from "../state/store.js";
import { getSession } from "../domain/sessions.js";
import { formatCountdown, formatDateTime } from "./format.js";
import { EmptyState, Tag } from "./widgets.js";

/** 通知中心：候补转正提醒在此确认，24 小时倒计时实时显示 */
export function NotificationsPage({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const { state, now, markAllRead, markRead, acceptOffer, refuseOffer } = useStore();
  const notifications = [...state.notifications].sort((a, b) => b.createdAt - a.createdAt);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="page">
      <section className="panel">
        <div className="section-title-row">
          <h2>转正提醒（{unread} 条未读）</h2>
          {unread > 0 && <button onClick={markAllRead}>全部标记已读</button>}
        </div>
        <p className="muted">收到提醒后需在一天内确认；未确认将自动顺给下一位候补。</p>
        {notifications.length === 0 && <EmptyState text="暂无通知" />}
        <div className="notice-list">
          {notifications.map((n) => {
            const session = getSession(state, n.sessionId);
            const enrollment = state.enrollments.find((e) => e.id === n.enrollmentId);
            const remaining =
              enrollment?.status === "offered" && enrollment.offerExpiresAt !== null
                ? enrollment.offerExpiresAt - now
                : null;
            const expired = remaining !== null && remaining <= 0;
            return (
              <article key={n.id} className={`notice-card ${n.read ? "is-read" : ""}`}>
                <header>
                  <div>
                    {!n.read && <Tag className="tag-offered">未读</Tag>}
                    <h3>
                      {n.clientName} · {session?.theme ?? "未知场次"}
                    </h3>
                  </div>
                  <span className="muted">{formatDateTime(n.createdAt)}</span>
                </header>
                <p>{n.message}</p>
                <footer>
                  {remaining !== null ? (
                    <span className={remaining < 60 * 60_000 ? "countdown-urgent" : "countdown"}>
                      {formatCountdown(remaining)}
                      {expired && "（将自动顺延）"}
                    </span>
                  ) : (
                    <span className="muted">该提醒已处理或失效</span>
                  )}
                  <div className="row-actions">
                    {remaining !== null && (
                      <>
                        <button
                          className="small-btn primary-btn"
                          onClick={() => {
                            acceptOffer(n.enrollmentId);
                            markRead(n.id);
                          }}
                        >
                          确认参加
                        </button>
                        <button
                          className="small-btn"
                          onClick={() => {
                            refuseOffer(n.enrollmentId);
                            markRead(n.id);
                          }}
                        >
                          婉拒
                        </button>
                      </>
                    )}
                    <button className="small-btn" onClick={() => onOpenSession(n.sessionId)}>
                      查看场次
                    </button>
                    {!n.read && (
                      <button className="small-btn" onClick={() => markRead(n.id)}>
                        标记已读
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
