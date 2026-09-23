// 场次列表页：顾问开组（主题/容量/开组时间）+ 全部场次筛选

import { useMemo, useState } from "react";
import type { AppData } from "../types";
import { allSessionViews } from "../domain/sessions";
import type { CreateSessionInput } from "../state/store";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  groupStatusClass,
  groupStatusLabel,
} from "../components/ui";
import { formatRange, isoToLocalInput, localInputToIso } from "../domain/time";

type Filter = "all" | "open" | "locked" | "cancelled";

export function Sessions({
  data,
  now,
  canCreate,
  onCreate,
  onOpenSession,
}: {
  data: AppData;
  now: Date;
  canCreate: boolean;
  onCreate: (input: CreateSessionInput) => void;
  onOpenSession: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const views = useMemo(
    () => allSessionViews(data, now).filter((v) => filter === "all" || v.session.status === filter),
    [data, now, filter]
  );

  const filters: Array<[Filter, string]> = [
    ["all", "全部"],
    ["open", "开放报名"],
    ["locked", "督导锁定"],
    ["cancelled", "已取消"],
  ];

  return (
    <div className="page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="hint">顾问每周开出不同主题的组，登记容量和开组时间</p>
            <h2>团体小组场次</h2>
          </div>
          {canCreate && (
            <button className="primary-action" onClick={() => setShowCreate(true)}>
              + 开出新组
            </button>
          )}
        </div>

        <div className="filter-row">
          {filters.map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "filter-chip active" : "filter-chip"}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>主题</th>
              <th>开组时间</th>
              <th>带组顾问</th>
              <th>场地</th>
              <th>席位</th>
              <th>候补</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {views.map((v) => (
              <tr key={v.session.id} className={v.past ? "row-muted" : ""}>
                <td className="cell-topic">{v.session.topic}</td>
                <td>{formatRange(v.session)}</td>
                <td>{v.leader?.name ?? "—"}</td>
                <td>{v.session.room}</td>
                <td>
                  {v.confirmed.length}/{v.session.capacity}
                </td>
                <td>{v.waiting.length}</td>
                <td>
                  <Badge tone={groupStatusClass[v.session.status].replace("badge-", "")}>
                    {groupStatusLabel[v.session.status]}
                  </Badge>
                </td>
                <td className="row-link">
                  <button className="link-btn" onClick={() => onOpenSession(v.session.id)}>
                    详情 →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {views.length === 0 && <EmptyState>该筛选下暂无场次</EmptyState>}
      </section>

      {showCreate && (
        <CreateSessionModal
          data={data}
          onClose={() => setShowCreate(false)}
          onCreate={(input) => {
            onCreate(input);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateSessionModal({
  data,
  onClose,
  onCreate,
}: {
  data: AppData;
  onClose: () => void;
  onCreate: (input: CreateSessionInput) => void;
}) {
  const defaultStart = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 90 * 60 * 1000);

  const [topic, setTopic] = useState("");
  const [leaderId, setLeaderId] = useState(data.counselors[0]?.id ?? "");
  const [capacity, setCapacity] = useState(6);
  const [start, setStart] = useState(isoToLocalInput(defaultStart.toISOString()));
  const [end, setEnd] = useState(isoToLocalInput(defaultEnd.toISOString()));
  const [room, setRoom] = useState("团体室 A");
  const [note, setNote] = useState("");

  const submit = () =>
    onCreate({
      topic,
      leaderId,
      capacity: Number(capacity),
      time: { start: localInputToIso(start), end: localInputToIso(end) },
      room,
      note: note || undefined,
    });

  return (
    <Modal title="开出新的团体小组" onClose={onClose}>
      <div className="form-grid">
        <Field label="主题">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="如：正念减压、亲子沟通"
          />
        </Field>
        <Field label="带组顾问">
          <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
            {data.counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="容量（人数）">
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </Field>
        <Field label="场地">
          <input value={room} onChange={(e) => setRoom(e.target.value)} />
        </Field>
        <Field label="开组时间">
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="结束时间">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <div className="form-wide">
          <Field label="备注">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：每周固定组、需提前面谈"
            />
          </Field>
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary-action" onClick={submit}>
          登记开组
        </button>
      </div>
    </Modal>
  );
}
