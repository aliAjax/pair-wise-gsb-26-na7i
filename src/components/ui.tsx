// 共享 UI 元件与中文标签映射

import type { ReactNode } from "react";
import { useEffect } from "react";
import type { AdjustmentKind, EntryStatus, GroupStatus } from "../types";
import type { Toast } from "../state/store";

export const entryStatusLabel: Record<EntryStatus, string> = {
  confirmed: "已占席位",
  waiting: "候补中",
  offered: "待确认转正",
  withdrawn: "已退出",
  expired: "逾期顺延",
  declined: "已放弃",
  cancelled: "已取消",
};

export const entryStatusClass: Record<EntryStatus, string> = {
  confirmed: "badge-green",
  waiting: "badge-blue",
  offered: "badge-amber",
  withdrawn: "badge-gray",
  expired: "badge-gray",
  declined: "badge-gray",
  cancelled: "badge-gray",
};

export const groupStatusLabel: Record<GroupStatus, string> = {
  open: "开放报名",
  locked: "督导锁定",
  cancelled: "已取消",
};

export const groupStatusClass: Record<GroupStatus, string> = {
  open: "badge-green",
  locked: "badge-amber",
  cancelled: "badge-gray",
};

export const adjustmentKindLabel: Record<AdjustmentKind, string> = {
  capacity: "调整容量",
  schedule: "调整时间",
  cancel: "取消场次",
};

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Panel({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          {hint && <p className="hint">{hint}</p>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="heading-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ToastHost({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.ok ? "toast-ok" : "toast-err"}`}>
          <i>{t.ok ? "✓" : "!"}</i>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
