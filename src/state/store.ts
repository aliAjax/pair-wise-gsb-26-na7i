// 应用状态：把排队规则的纯函数接到 React，并在每次变更后本地保存

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdjustmentKind, AppData, OpResult, TimeRange } from "../types";
import { loadData, saveData, clearData } from "../storage/local";
import { buildSeed } from "../domain/seed";
import {
  acceptOffer,
  createAdjustment,
  createSession,
  declineOffer,
  enroll,
  expireDueOffers,
  reviewAdjustment,
  setLocked,
  withdraw,
} from "../domain/queue";

export interface Toast extends OpResult {
  id: number;
}

export interface CreateSessionInput {
  topic: string;
  leaderId: string;
  capacity: number;
  time: TimeRange;
  room: string;
  note?: string;
}

export interface CreateAdjustmentInput {
  sessionId: string;
  kind: AdjustmentKind;
  reason: string;
  newCapacity?: number;
  newTime?: TimeRange;
}

function initData(): AppData {
  return loadData() ?? buildSeed();
}

export function useAppState(actor: string) {
  const [data, setData] = useState<AppData>(initData);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const now = new Date(data.now);

  const notify = useCallback((result: OpResult) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev, { ...result, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  // 所有变更统一收口：先跑过期顺延，再落本地
  const commit = useCallback(
    (updater: (draft: AppData) => { data: AppData; result: OpResult } | void) => {
      let result: OpResult = { ok: true, message: "已保存" };
      setData((prev) => {
        let working = prev;
        const produced = updater(working);
        if (produced) {
          working = produced.data;
          result = produced.result;
        }
        const swept = expireDueOffers(working, working.now);
        working = swept.data;
        saveData(working);
        return working;
      });
      // result 在 setData 回调内赋值（React 18+ 同步执行 updater）
      notify(result);
    },
    [notify]
  );

  // 页面刷新时先顺延一次
  useEffect(() => {
    setData((prev) => {
      const swept = expireDueOffers(prev, prev.now);
      if (swept.expired > 0) {
        saveData(swept.data);
        return swept.data;
      }
      return prev;
    });
  }, []);

  const enrollClient = useCallback(
    (sessionId: string, clientId: string) => {
      commit((d) => enroll(d, sessionId, clientId, d.now));
    },
    [commit]
  );

  const confirmOffer = useCallback(
    (entryId: string) => commit((d) => acceptOffer(d, entryId, d.now)),
    [commit]
  );
  const refuseOffer = useCallback(
    (entryId: string) => commit((d) => declineOffer(d, entryId, d.now)),
    [commit]
  );
  const withdrawEntry = useCallback(
    (entryId: string, reason: string) => commit((d) => withdraw(d, entryId, reason, d.now)),
    [commit]
  );
  const openSession = useCallback(
    (input: CreateSessionInput) => commit((d) => createSession(d, input, d.now)),
    [commit]
  );
  const toggleLock = useCallback(
    (sessionId: string, locked: boolean) => commit((d) => setLocked(d, sessionId, locked, d.now)),
    [commit]
  );
  const requestAdjustment = useCallback(
    (input: CreateAdjustmentInput) =>
      commit((d) => createAdjustment(d, { ...input, requestedBy: actor }, d.now)),
    [commit, actor]
  );
  const decideAdjustment = useCallback(
    (orderId: string, approve: boolean, note: string) =>
      commit((d) => reviewAdjustment(d, orderId, approve, actor, note, d.now)),
    [commit, actor]
  );

  // 演示用：快进机构时钟，到期提醒自动顺延给下一位
  const advanceHours = useCallback(
    (hours: number) => {
      commit((d) => {
        const next = new Date(new Date(d.now).getTime() + hours * 3600 * 1000).toISOString();
        return { data: { ...d, now: next }, result: { ok: true, message: `时间快进 ${hours} 小时` } };
      });
    },
    [commit]
  );

  const resetToSeed = useCallback(() => {
    clearData();
    const fresh = buildSeed();
    saveData(fresh);
    setData(fresh);
    notify({ ok: true, message: "已重置为演示数据" });
  }, [notify]);

  return {
    data,
    now,
    toasts,
    enrollClient,
    confirmOffer,
    refuseOffer,
    withdrawEntry,
    openSession,
    toggleLock,
    requestAdjustment,
    decideAdjustment,
    advanceHours,
    resetToSeed,
  };
}
