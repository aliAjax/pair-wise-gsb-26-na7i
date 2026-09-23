import { useState } from "react";
import "./styles.css";
import { useAppState } from "./state/store";
import { ToastHost } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { SessionDetail } from "./pages/SessionDetail";
import { Adjustments } from "./pages/Adjustments";
import { formatDateTime } from "./domain/time";

export type Role = "counselor" | "frontdesk" | "supervisor";

const roleLabel: Record<Role, string> = {
  counselor: "顾问",
  frontdesk: "前台",
  supervisor: "督导",
};

type Page = { name: "dashboard" } | { name: "sessions" } | { name: "detail"; id: string } | { name: "adjustments" };

function App() {
  const [role, setRole] = useState<Role>("counselor");
  const [page, setPage] = useState<Page>({ name: "dashboard" });

  // 不同角色用不同的操作人署名
  const actor = roleLabel[role];
  const app = useAppState(actor);
  const { data, now } = app;

  const openSession = (id: string) => setPage({ name: "detail", id });

  const nav = (
    <nav className="topnav">
      <button
        className={page.name === "dashboard" ? "nav-item active" : "nav-item"}
        onClick={() => setPage({ name: "dashboard" })}
      >
        总览
      </button>
      <button
        className={page.name === "sessions" || page.name === "detail" ? "nav-item active" : "nav-item"}
        onClick={() => setPage({ name: "sessions" })}
      >
        场次
      </button>
      <button
        className={page.name === "adjustments" ? "nav-item active" : "nav-item"}
        onClick={() => setPage({ name: "adjustments" })}
      >
        调整单
        {data.adjustments.some((a) => a.status === "pending") && <i className="nav-dot" />}
      </button>
    </nav>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">团</span>
          <div>
            <h1>团体小组排场次</h1>
            <p>报名候补 · 一天确认期顺给 · 锁定组调整单</p>
          </div>
        </div>
        <div className="topbar-right">
          <div className="clock-card">
            <span>机构时间</span>
            <strong>{formatDateTime(data.now)}</strong>
            <div className="clock-btns">
              <button onClick={() => app.advanceHours(1)} title="模拟时间流逝">
                +1 小时
              </button>
              <button onClick={() => app.advanceHours(25)}>+25 小时</button>
              <button className="reset-btn" onClick={app.resetToSeed} title="清空本地数据并恢复演示">
                重置
              </button>
            </div>
          </div>
          <div className="role-switch">
            <span>当前身份</span>
            <div className="role-btns">
              {(Object.keys(roleLabel) as Role[]).map((r) => (
                <button
                  key={r}
                  className={role === r ? "role-btn active" : "role-btn"}
                  onClick={() => setRole(r)}
                >
                  {roleLabel[r]}
                </button>
              ))}
            </div>
            <p className="role-hint">
              {role === "counselor" && "可开组、报名、退出、为锁定组提调整单"}
              {role === "frontdesk" && "可代报名、处理候补转正与退出，不能开组或动锁定组"}
              {role === "supervisor" && "可锁定/解锁场次、审批调整单"}
            </p>
          </div>
        </div>
      </header>

      {nav}

      <main className="content">
        {page.name === "dashboard" && <Dashboard data={data} now={now} onOpenSession={openSession} />}

        {page.name === "sessions" && (
          <Sessions
            data={data}
            now={now}
            canCreate={role !== "frontdesk"}
            onCreate={app.openSession}
            onOpenSession={openSession}
          />
        )}

        {page.name === "detail" && (
          <SessionDetail
            data={data}
            now={now}
            sessionId={page.id}
            role={role}
            onBack={() => setPage({ name: "sessions" })}
            onEnroll={app.enrollClient}
            onConfirm={app.confirmOffer}
            onDecline={app.refuseOffer}
            onWithdraw={app.withdrawEntry}
            onToggleLock={app.toggleLock}
            onRequestAdjustment={app.requestAdjustment}
            onReviewAdjustment={app.decideAdjustment}
          />
        )}

        {page.name === "adjustments" && (
          <Adjustments
            data={data}
            role={role}
            onReview={app.decideAdjustment}
            onOpenSession={openSession}
          />
        )}
      </main>

      <footer className="app-foot">
        场次资料（domain）· 排队规则（纯函数）· 本地保存（localStorage）· 页面（React）四层分开实现
      </footer>

      <ToastHost toasts={app.toasts} />
    </div>
  );
}

export default App;
