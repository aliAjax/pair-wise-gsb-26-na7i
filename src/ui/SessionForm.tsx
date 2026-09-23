import { useState } from "react";
import { useStore } from "../state/store.js";
import { formatDateInput, parseDateInput } from "./format.js";
import type { Session } from "../domain/types.js";

interface SessionFormProps {
  session?: Session;
  onDone: () => void;
}

/** 顾问开组 / 未锁定场次直接编辑（锁定场次改由调整单表单处理） */
export function SessionForm({ session, onDone }: SessionFormProps) {
  const { state, addSession, editSession } = useStore();
  const [theme, setTheme] = useState(session?.theme ?? "");
  const [counselorId, setCounselorId] = useState(session?.counselorId ?? state.counselors[0]?.id ?? "");
  const [startAt, setStartAt] = useState(
    formatDateInput(session?.startAt ?? Date.now() + 24 * 3_600_000)
  );
  const [durationMin, setDurationMin] = useState(session?.durationMin ?? 90);
  const [capacity, setCapacity] = useState(session?.capacity ?? 6);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      theme,
      counselorId,
      startAt: parseDateInput(startAt),
      durationMin: Number(durationMin),
      capacity: Number(capacity),
    };
    if (session) {
      editSession(session.id, payload);
    } else {
      addSession(payload);
    }
    onDone();
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        <span>小组主题</span>
        <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="如：焦虑情绪调节小组" />
      </label>
      <label>
        <span>开组顾问</span>
        <select value={counselorId} onChange={(e) => setCounselorId(e.target.value)}>
          {state.counselors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>开组时间</span>
        <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
      </label>
      <label>
        <span>时长（分钟）</span>
        <input
          type="number"
          min={1}
          value={durationMin}
          onChange={(e) => setDurationMin(Number(e.target.value))}
        />
      </label>
      <label>
        <span>容量（人）</span>
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </label>
      <div className="form-actions">
        <button type="button" onClick={onDone}>
          取消
        </button>
        <button type="submit" className="primary-btn">
          {session ? "保存修改" : "开组登记"}
        </button>
      </div>
    </form>
  );
}
