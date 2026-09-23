// 应用状态容器：串联领域规则与本地保存，页面只通过这里派发操作
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdjustmentPayload,
  AdjustmentType,
  AppNotification,
  AppState,
  Role,
} from "../domain/types.js";
import {
  createSession,
  getCounselor,
  getSession,
  now as nowOf,
  setLocked as setSessionLocked,
} from "../domain/sessions.js";
import {
  confirmOffer,
  declineOffer,
  exitEnrollment,
  signUp,
  sweepExpiredOffers,
  promoteWaiting,
} from "../domain/queue.js";
import {
  approveAdjustment,
  createAdjustment,
  rejectAdjustment,
} from "../domain/adjustments.js";
import { clearState, loadState, saveState } from "../storage/localStore.js";
import { buildSeedState } from "./seed.js";
import { nextId } from "./ids.js";

interface StoreValue {
  state: AppState;
  role: Role;
  setRole: (role: Role) => void;
  now: number;
  error: string | null;
  setError: (message: string | null) => void;
  // 顾问 / 管理操作
  addSession: (input: {
    theme: string;
    counselorId: string;
    startAt: number;
    durationMin: number;
    capacity: number;
  }) => void;
  editSession: (
    sessionId: string,
    patch: { theme?: string; startAt?: number; durationMin?: number; capacity?: number }
  ) => void;
  toggleLock: (sessionId: string) => void;
  // 来访者操作
  enroll: (sessionId: string, clientName: string) => void;
  leave: (enrollmentId: string) => void;
  acceptOffer: (enrollmentId: string) => void;
  refuseOffer: (enrollmentId: string) => void;
  // 调整单
  openAdjustment: (
    sessionId: string,
    type: AdjustmentType,
    reason: string,
    payload?: AdjustmentPayload
  ) => void;
  approve: (adjustmentId: string, note?: string) => void;
  reject: (adjustmentId: string, note: string) => void;
  // 通知
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  // 时钟（演示 24 小时超时）
  advanceClock: (ms: number) => void;
  resetClock: () => void;
  resetData: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function applySweep(state: AppState, atTime: number): AppState {
  const result = sweepExpiredOffers(state, atTime);
  if (result.notifications.length === 0) return result.state;
  return {
    ...result.state,
    notifications: [...state.notifications, ...result.notifications],
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState() ?? buildSeedState());
  const [role, setRole] = useState<Role>("client");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  // 持久化：本地保存与规则、页面分离，任何变更都统一落盘
  useEffect(() => {
    saveState(state);
  }, [state]);

  // 每 30 秒走一次到期扫描，保证“一天内没确认就顺给下一位”自动生效
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setState((prev) => {
      const swept = applySweep(prev, nowOf(prev));
      return swept === prev ? prev : swept;
    });
  }, [tick, state.clockOffsetMs]);

  const mutate = useCallback((fn: (draft: AppState, atTime: number) => AppState) => {
    setError(null);
    const swept = applySweep(stateRef.current, nowOf(stateRef.current));
    if (swept !== stateRef.current) setState(swept);
    try {
      setState(fn(swept, nowOf(swept)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const value = useMemo<StoreValue>(() => {
    const withNotifications = (
      prev: AppState,
      next: AppState,
      notifications: AppNotification[]
    ): AppState =>
      notifications.length
        ? { ...next, notifications: [...prev.notifications, ...notifications] }
        : next;

    return {
      state,
      role,
      setRole,
      now: nowOf(state),
      error,
      setError,

      addSession: (input) =>
        mutate((draft, atTime) => ({
          ...draft,
          sessions: [...draft.sessions, createSession(draft, input, nextId("s"), atTime)],
        })),

      editSession: (sessionId, patch) =>
        mutate((draft) => {
          const session = draft.sessions.find((s) => s.id === sessionId);
          if (!session) throw new Error("场次不存在");
          if (session.locked) throw new Error("督导已锁定该场次，请提交带原因的调整单");
          if (session.status !== "active") throw new Error("已取消场次不能编辑");
          if (patch.theme !== undefined && !patch.theme.trim()) throw new Error("主题不能为空");
          if (patch.capacity !== undefined) {
            const held = draft.enrollments.filter(
              (e) => e.sessionId === sessionId && (e.status === "booked" || e.status === "offered")
            ).length;
            if (patch.capacity < held) {
              throw new Error(`新容量不能低于当前已占席位（${held} 个）`);
            }
          }
          const updated = {
            ...session,
            theme: patch.theme?.trim() ?? session.theme,
            startAt: patch.startAt ?? session.startAt,
            durationMin: patch.durationMin ?? session.durationMin,
            capacity: patch.capacity ?? session.capacity,
          };
          let next: AppState = {
            ...draft,
            sessions: draft.sessions.map((s) => (s.id === sessionId ? updated : s)),
          };
          // 直接扩容同样按排队规则顺补
          const promoted = promoteWaiting(next, sessionId, nowOf(next));
          return withNotifications(next, promoted.state, promoted.notifications);
        }),

      toggleLock: (sessionId) =>
        mutate((draft) => ({
          ...draft,
          sessions: draft.sessions.map((s) =>
            s.id === sessionId ? setSessionLocked(s, !s.locked) : s
          ),
        })),

      enroll: (sessionId, clientName) =>
        mutate((draft, atTime) => {
          const result = signUp(draft, sessionId, clientName, nextId("e"), atTime);
          return result.state;
        }),

      leave: (enrollmentId) =>
        mutate((draft, atTime) => {
          const result = exitEnrollment(draft, enrollmentId, atTime);
          return withNotifications(draft, result.state, result.notifications);
        }),

      acceptOffer: (enrollmentId) =>
        mutate((draft, atTime) => confirmOffer(draft, enrollmentId, atTime).state),

      refuseOffer: (enrollmentId) =>
        mutate((draft, atTime) => {
          const result = declineOffer(draft, enrollmentId, atTime);
          return withNotifications(draft, result.state, result.notifications);
        }),

      openAdjustment: (sessionId, type, reason, payload) =>
        mutate((draft, atTime) => {
          const session = getSession(draft, sessionId);
          const requester = session
            ? getCounselor(draft, session.counselorId)?.name ?? "顾问"
            : "顾问";
          return {
            ...draft,
            adjustments: [
              ...draft.adjustments,
              createAdjustment(
                draft,
                sessionId,
                { type, reason, payload },
                nextId("a"),
                requester,
                atTime
              ),
            ],
          };
        }),

      approve: (adjustmentId, note = "") =>
        mutate((draft, atTime) => approveAdjustment(draft, adjustmentId, "督导", atTime, note)),

      reject: (adjustmentId, noteText) =>
        mutate((draft, atTime) => rejectAdjustment(draft, adjustmentId, "督导", atTime, noteText)),

      markRead: (notificationId) =>
        setState((prev) => ({
          ...prev,
          notifications: prev.notifications.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
        })),

      markAllRead: () =>
        setState((prev) => ({
          ...prev,
          notifications: prev.notifications.map((n) => ({ ...n, read: true })),
        })),

      advanceClock: (ms) =>
        setState((prev) => {
          const offset = prev.clockOffsetMs + ms;
          const shifted: AppState = { ...prev, clockOffsetMs: offset };
          return applySweep(shifted, nowOf(shifted));
        }),

      resetClock: () => setState((prev) => ({ ...prev, clockOffsetMs: 0 })),

      resetData: () => {
        clearState();
        setState(buildSeedState());
        setError(null);
      },
    };
  }, [state, role, error, mutate]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
