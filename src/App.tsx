import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "./state/store.js";
import { pendingAdjustments } from "./domain/adjustments.js";
import { SessionsPage } from "./ui/SessionsPage.js";
import { SessionDetailPage } from "./ui/SessionDetailPage.js";
import { AdjustmentsPage } from "./ui/AdjustmentsPage.js";
import { NotificationsPage } from "./ui/NotificationsPage.js";
import type { Role } from "./domain/types.js";
import "./styles.css";

type Route =
  | { name: "sessions" }
  | { name: "session"; id: string }
  | { name: "adjustments" }
  | { name: "notifications" };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  if (clean.startsWith("session/")) return { name: "session", id: clean.slice("session/".length) };
  if (clean === "adjustments") return { name: "adjustments" };
  if (clean === "notifications") return { name: "notifications" };
  return { name: "sessions" };
}

function routeToHash(route: Route): string {
  switch (route.name) {
    case "session":
      return `#/session/${route.id}`;
    case "adjustments":
      return "#/adjustments";
    case "notifications":
      return "#/notifications";
    default:
      return "#/sessions";
  }
}

const roles: { value: Role; label: string }[] = [
  { value: "client", label: "来访者" },
  { value: "counselor", label: "顾问" },
  { value: "supervisor", label: "督导" },
];

function Shell() {
  const store = useStore();
  const { state, role, setRole, error, setError, advanceClock, resetClock, resetData } = store;
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (next: Route) => {
    window.location.hash = routeToHash(next);
  };

  const pendingCount = pendingAdjustments(state).length;
  const unreadCount = state.notifications.filter((n) => !n.read).length;
  const clockOffsetDays = state.clockOffsetMs / 86_400_000;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand" onClick={() => navigate({ name: "sessions" })}>
            <h1>团体小组排场次</h1>
            <span>hxwl-12 · 心理咨询机构内部系统</span>
          </div>
          <nav className="main-nav">
            <button
              className={route.name === "sessions" || route.name === "session" ? "nav-active" : ""}
              onClick={() => navigate({ name: "sessions" })}
            >
              场次
            </button>
            <button
              className={route.name === "notifications" ? "nav-active" : ""}
              onClick={() => navigate({ name: "notifications" })}
            >
              通知{unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            <button
              className={route.name === "adjustments" ? "nav-active" : ""}
              onClick={() => navigate({ name: "adjustments" })}
            >
              调整单{pendingCount > 0 && <span className="badge badge-warn">{pendingCount}</span>}
            </button>
          </nav>
          <div className="header-side">
            <label className="role-switch">
              身份
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>知道了</button>
        </div>
      )}

      <main className="app-main">
        {route.name === "sessions" && <SessionsPage onOpen={(id) => navigate({ name: "session", id })} />}
        {route.name === "session" && (
          <SessionDetailPage sessionId={route.id} onBack={() => navigate({ name: "sessions" })} />
        )}
        {route.name === "adjustments" && (
          <AdjustmentsPage onOpenSession={(id) => navigate({ name: "session", id })} />
        )}
        {route.name === "notifications" && (
          <NotificationsPage onOpenSession={(id) => navigate({ name: "session", id })} />
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <span>
            模拟时钟偏移：<strong>{clockOffsetDays.toFixed(2)}</strong> 天（用于演示 24 小时确认期限）
          </span>
          <div className="row-actions">
            <button className="small-btn" onClick={() => advanceClock(60 * 60_000)}>
              快进 1 小时
            </button>
            <button className="small-btn" onClick={() => advanceClock(25 * 60 * 60_000)}>
              快进 25 小时
            </button>
            <button className="small-btn" onClick={resetClock}>
              恢复当前时间
            </button>
            <button
              className="small-btn danger-btn"
              onClick={() => {
                if (window.confirm("确认清空本地数据并恢复演示数据？")) resetData();
              }}
            >
              重置演示数据
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
