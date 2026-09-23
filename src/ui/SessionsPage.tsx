import { useMemo, useState } from "react";
import { useStore } from "../state/store.js";
import {
  countByStatus,
  enrollmentsOf,
  getCounselor,
  heldSeats,
  sessionsByStatus,
} from "../domain/sessions.js";
import { formatDateTime } from "./format.js";
import { Modal, Tag } from "./widgets.js";
import { SessionForm } from "./SessionForm.js";
import type { Session } from "../domain/types.js";

type Filter = "upcoming" | "cancelled";

export function SessionsPage({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const { state, role, now } = useStore();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [creating, setCreating] = useState(false);

  const sessions = useMemo(
    () => sessionsByStatus(state, filter === "upcoming" ? "active" : "cancelled", now),
    [state, filter, now]
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="tabs">
          <button className={filter === "upcoming" ? "tab active" : "tab"} onClick={() => setFilter("upcoming")}>
            进行中场次
          </button>
          <button className={filter === "cancelled" ? "tab active" : "tab"} onClick={() => setFilter("cancelled")}>
            已取消场次（留档）
          </button>
        </div>
        {role === "counselor" && filter === "upcoming" && (
          <button className="primary-btn" onClick={() => setCreating(true)}>
            新开组
          </button>
        )}
      </div>

      {sessions.length === 0 && <p className="empty-state">暂无场次</p>}

      <div className="card-grid">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} onOpen={() => onOpen(session.id)} />
        ))}
      </div>

      {creating && (
        <Modal title="新开组登记" onClose={() => setCreating(false)}>
          <SessionForm onDone={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}

function SessionCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const { state, role, toggleLock } = useStore();
  const counselor = getCounselor(state, session.counselorId);
  const roster = enrollmentsOf(state, session.id);
  const counts = countByStatus(roster);
  const held = heldSeats(roster);

  return (
    <article className={`session-card ${session.status === "cancelled" ? "is-cancelled" : ""}`}>
      <header>
        <div>
          <h3>{session.theme}</h3>
          <p className="muted">
            {counselor?.name ?? "未知顾问"} · {formatDateTime(session.startAt)} · {session.durationMin} 分钟
          </p>
        </div>
        <div className="tag-row">
          {session.locked && <Tag className="tag-locked">督导锁定</Tag>}
          {session.status === "cancelled" && <Tag className="tag-lapsed">已取消</Tag>}
        </div>
      </header>

      <div className="seat-line">
        <strong>
          {held}/{session.capacity}
        </strong>
        <span>
          席位已占 · 候补 {counts.waiting} 人
          {counts.offered > 0 && ` · 待确认 ${counts.offered} 人`}
        </span>
      </div>

      <div className="card-actions">
        <button onClick={onOpen}>查看场次</button>
        {role === "supervisor" && session.status === "active" && (
          <button onClick={() => toggleLock(session.id)}>
            {session.locked ? "解锁场次" : "锁定场次"}
          </button>
        )}
      </div>
    </article>
  );
}
