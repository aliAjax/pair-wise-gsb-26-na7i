import { useState } from "react";
import { useStore } from "../state/store.js";
import { formatDateInput, parseDateInput } from "./format.js";
import type { AdjustmentType, Session } from "../domain/types.js";

/** 锁定场次专用：另建一张带原因的调整单 */
export function AdjustmentForm({ session, onDone }: { session: Session; onDone: () => void }) {
  const { openAdjustment } = useStore();
  const [type, setType] = useState<AdjustmentType>("edit");
  const [reason, setReason] = useState("");
  const [theme, setTheme] = useState(session.theme);
  const [startAt, setStartAt] = useState(formatDateInput(session.startAt));
  const [durationMin, setDurationMin] = useState(session.durationMin);
  const [capacity, setCapacity] = useState(session.capacity);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "cancel") {
      openAdjustment(session.id, "cancel", reason);
    } else {
      openAdjustment(session.id, "edit", reason, {
        theme,
        startAt: parseDateInput(startAt),
        durationMin: Number(durationMin),
        capacity: Number(capacity),
      });
    }
    onDone();
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <p className="form-hint">
        该场次已被督导锁定，不能直接修改；请填写调整原因并提交调整单，督导批准后生效。
      </p>
      <label>
        <span>调整类型</span>
        <select value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
          <option value="edit">修改场次资料</option>
          <option value="cancel">取消场次</option>
        </select>
      </label>
      {type === "edit" && (
        <>
          <label>
            <span>新主题</span>
            <input value={theme} onChange={(e) => setTheme(e.target.value)} />
          </label>
          <label>
            <span>新开组时间</span>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </label>
          <label>
            <span>新时长（分钟）</span>
            <input
              type="number"
              min={1}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
          </label>
          <label>
            <span>新容量（人，不得低于已占席位）</span>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </label>
        </>
      )}
      <label className="full-width">
        <span>调整原因（必填）</span>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="说明为什么需要调整，供督导审批留痕"
        />
      </label>
      <div className="form-actions">
        <button type="button" onClick={onDone}>
          取消
        </button>
        <button type="submit" className="primary-btn">
          提交调整单
        </button>
      </div>
    </form>
  );
}
