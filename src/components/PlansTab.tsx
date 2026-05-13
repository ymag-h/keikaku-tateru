import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from './MembersTab';
import type { RoutinesFile, DailyRoutine } from './RoutinesTab';
import type { ShiftsFile } from './ShiftsTab';
import type { Role } from '@/lib/roles';
import { plannedRoles, getRolePanelClasses } from '@/lib/roles';
import type { AppMeta } from './settings/GeneralPane';
import {
  type DailyPlan,
  type AdhocTask,
  type CustomRoutine,
  type PlanSlots,
  forecastRoutineIds,
  backlogRoutineIds,
  createEmptyPlan,
  migratePlanToV11,
  routinesForRole,
  totalAssignedLh,
  getAttendees,
  getSlotLogins,
  setSlotLoginAt,
  resizeSlotLogins,
} from '@/lib/planUtils';
import {
  todayISO,
  addDays,
  formatJaDay,
  getDow,
  DOW_LABELS,
} from '@/lib/dateUtils';
import { NumberInput } from './plans/NumberInput';
import { PersonColumn } from './plans/PersonColumn';

type Props = {
  members: Member[];
  routines: RoutinesFile | null;
  shifts: ShiftsFile | null;
  planSlots: PlanSlots;
  roles?: Role[];
  meta?: AppMeta | null;
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function calcPlanLh(
  backlog: number,
  jph: number | null,
): number {
  if (!jph || jph <= 0) return 0;
  if (backlog <= 0) return 0;
  return Math.round((backlog / jph) * 10) / 10;
}

export function PlansTab({ members, routines, shifts, planSlots, roles, meta }: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  const rolesInPlan = useMemo(() => plannedRoles(roles ?? []), [roles]);
  const firstRoleId = rolesInPlan[0]?.id ?? 'QC';

  // --- ロード ---
  const load = useCallback(async () => {
    try {
      const raw = await window.api.readPlan(date);
      // readPlan は { ok, data, path } のラッパー
      if (raw && raw.ok && raw.data) {
        setPlan(migratePlanToV11(raw.data, routines, planSlots));
      } else {
        setPlan(createEmptyPlan(date, routines, planSlots));
      }
      setDirty(false);
      setStatus(null);
    } catch (e) {
      console.error(e);
      setStatus({ kind: 'error', msg: String(e) });
    }
  }, [date, routines, planSlots]);

  useEffect(() => {
    load();
  }, [load]);

  // --- スロット配列リサイズ (planSlots 変更時) ---
  useEffect(() => {
    if (!plan) return;
    let next = plan;
    for (const [roleId, count] of Object.entries(planSlots)) {
      next = resizeSlotLogins(next, roleId, count);
    }
    if (next !== plan) setPlan(next);
  }, [planSlots, plan]);

  // --- attendees (シフトに出勤) ---
  const attendees = useMemo(
    () => getAttendees(members, shifts, date),
    [members, shifts, date],
  );

  // --- Role 別 candidates / routines / slots / totalLh / capacity ---
  const candidatesByRole = useMemo(() => {
    const map: Record<string, Member[]> = {};
    for (const r of rolesInPlan) {
      map[r.id] = attendees.filter(
        (m) => (m.role ?? firstRoleId) === r.id,
      );
    }
    return map;
  }, [attendees, rolesInPlan, firstRoleId]);

  const routinesByRole = useMemo(() => {
    const map: Record<string, DailyRoutine[]> = {};
    for (const r of rolesInPlan) {
      map[r.id] = routinesForRole(routines, r.id);
    }
    return map;
  }, [rolesInPlan, routines]);

  // --- 保存 ---
  const save = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await window.api.writePlan(date, plan);
      setDirty(false);
      setStatus({ kind: 'ok', msg: '保存しました' });
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      console.error(e);
      setStatus({ kind: 'error', msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // --- plan パッチ ---
  const patchPlan = useCallback((patch: Partial<DailyPlan>) => {
    setPlan((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }, []);

  // --- processing_forecasts 更新 (担当者への自動配分つき) ---
  const updateForecast = (
    id: string,
    patch: Partial<DailyPlan['processing_forecasts'][string]>,
  ) => {
    if (!plan) return;
    const cur = plan.processing_forecasts[id] ?? {
      forecast_units: null,
      backlog_units: 0,
      target_jph: null,
      plan_lh: 0,
      risk_note: '',
      assignees: [],
    };
    const merged = { ...cur, ...patch };
    merged.plan_lh = calcPlanLh(merged.backlog_units, merged.target_jph);

    // 担当者への Plan LH 自動配分
    const nextAssign = { ...plan.assignments };
    const oldAssignees = new Set(cur.assignees ?? []);
    const newAssignees = merged.assignees ?? [];

    // 旧担当から外れた人の該当ルーチンを削除
    for (const login of oldAssignees) {
      if (!newAssignees.includes(login) && nextAssign[login]) {
        const { [id]: _, ...rest } = nextAssign[login];
        nextAssign[login] = rest;
      }
    }
    // 新担当に均等配分 (小数第2位切り捨て)
    if (newAssignees.length > 0) {
      const perPerson = merged.plan_lh > 0
        ? Math.floor((merged.plan_lh / newAssignees.length) * 100) / 100
        : 0;
      for (const login of newAssignees) {
        nextAssign[login] = { ...(nextAssign[login] ?? {}), [id]: perPerson };
      }
    }

    setPlan({
      ...plan,
      processing_forecasts: { ...plan.processing_forecasts, [id]: merged },
      assignments: nextAssign,
    });
    setDirty(true);
  };

  // --- assignments 更新 ---
  const updateAssignment = (login: string, routineId: string, lh: number) => {
    if (!plan) return;
    const cur = plan.assignments[login] ?? {};
    const next = { ...cur, [routineId]: lh };
    patchPlan({ assignments: { ...plan.assignments, [login]: next } });
  };

  // --- slot 選択 (メンバー変更時、assignments を default_lh で auto-fill) ---
  // Phase ④-D (B案): slotIdx === 0 (1人目) は毎回 default_lh で強制再初期化。
  //                  それ以外の slot は初登場 login のみ default_lh を展開。
  const setSlotLogin = (roleId: string, slotIdx: number, login: string | null) => {
    if (!plan) return;
    const updatedPlan = setSlotLoginAt(plan, roleId, slotIdx, login);

    const nextAssign = { ...plan.assignments };
    if (login) {
      const rs = routinesByRole[roleId] ?? [];
      const buildDefault = (): Record<string, number> => {
        const rec: Record<string, number> = {};
        for (const r of rs) {
          if (r.default_lh > 0) rec[r.id] = r.default_lh;
        }
        return rec;
      };
      if (slotIdx === 0) {
        // 1人目 → 強制再初期化 (手動編集も default にリセット)
        nextAssign[login] = buildDefault();
      } else if (!nextAssign[login]) {
        // 2人目以降 → 初登場のみ default 展開 (既存は尊重)
        nextAssign[login] = buildDefault();
      }
    }
    setPlan({ ...updatedPlan, assignments: nextAssign });
    setDirty(true);
  };

  // --- custom routines ---
  const addCustomRoutine = (login: string, roleId: string) => {
    if (!plan) return;
    const nc: CustomRoutine = {
      id: uid('custom'),
      label: '',
      login,
      role: roleId,
      lh: 0.5,
    };
    patchPlan({ custom_routines: [...plan.custom_routines, nc] });
  };
  const updateCustomRoutine = (id: string, patch: Partial<CustomRoutine>) => {
    if (!plan) return;
    patchPlan({
      custom_routines: plan.custom_routines.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });
  };
  const deleteCustomRoutine = (id: string) => {
    if (!plan) return;
    patchPlan({
      custom_routines: plan.custom_routines.filter((c) => c.id !== id),
    });
  };

  // --- adhoc ---
  const addAdhoc = () => {
    if (!plan) return;
    const t: AdhocTask = {
      id: uid('adhoc'),
      label: '',
      who: '',
      need_lh: 0.5,
      progress: 0,
      due: date,
    };
    patchPlan({ adhoc_tasks: [...plan.adhoc_tasks, t] });
  };
  const updateAdhoc = (id: string, patch: Partial<AdhocTask>) => {
    if (!plan) return;
    patchPlan({
      adhoc_tasks: plan.adhoc_tasks.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };
  const deleteAdhoc = (id: string) => {
    if (!plan) return;
    patchPlan({ adhoc_tasks: plan.adhoc_tasks.filter((a) => a.id !== id) });
  };

  // --- weekly ---
  const updateWeekly = (
    id: string,
    patch: Partial<DailyPlan['weekly_progress'][string]>,
  ) => {
    if (!plan) return;
    const cur = plan.weekly_progress[id] ?? { done_lh: 0, need_lh: 0, completed: false };
    patchPlan({
      weekly_progress: { ...plan.weekly_progress, [id]: { ...cur, ...patch } },
    });
  };

  if (!plan) {
    return <p className="p-4 text-sm text-muted-foreground">読み込み中…</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ---- トップバー: 日付 / 保存 ---- */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDate(addDays(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 w-36"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDate(addDays(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-slate-700">
          {formatJaDay(date)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDate(todayISO())}
        >
          今日
        </Button>

        <span className="mx-2 h-6 w-px bg-slate-300" />

        <span className="text-xs text-slate-500">出勤: {attendees.length}名</span>

        <div className="ml-auto flex items-center gap-2">
          {status && (
            <span
              className={`text-xs ${
                status.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {status.msg}
            </span>
          )}
          {dirty && <span className="text-xs text-amber-600">未保存</span>}
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !dirty}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="mr-1 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>

      {/* ---- コメント ---- */}
      <div className="rounded-lg border border-slate-200 bg-white p-2">
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">本日コメント</span>
          <Input
            value={plan.comment}
            onChange={(e) => patchPlan({ comment: e.target.value })}
            placeholder="(例) 棚卸終日実施のため..."
            className="h-7 flex-1"
          />
        </label>
      </div>

      {/* ---- 上段: 左ブロック (Daily予測 / Adhoc / Weekly) ---- */}
      <div
        className={`grid grid-cols-1 gap-3 ${
          meta?.layout?.show_forecast_panel !== false
            ? 'lg:grid-cols-3'
            : 'lg:grid-cols-2'
        }`}
      >
        {/* Routine Backlog・必要LH (レイアウト設定で非表示可) */}
        {meta?.layout?.show_forecast_panel !== false && (
        <div className="rounded-lg border-2 border-sky-200 bg-sky-50/30 p-2 shadow-sm">
          <div className="mb-2 rounded bg-sky-100 px-2 py-1 text-sm font-semibold text-sky-900">
            Routine Backlog・必要LH
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-sky-200 text-left text-[10px] text-sky-800">
                <th className="pb-1">ルーチン</th>
                <th className="pb-1 text-right">Backlog</th>
                <th className="pb-1 text-right">目標JPH</th>
                <th className="pb-1 text-right">Plan LH</th>
                <th className="pb-1">担当</th>
              </tr>
            </thead>
            <tbody>
              {backlogRoutineIds(routines).map((id) => {
                const r = routines?.daily.find((x) => x.id === id);
                const fc = plan.processing_forecasts[id] ?? {
                  forecast_units: null,
                  backlog_units: 0,
                  target_jph: null,
                  plan_lh: 0,
                  risk_note: '',
                };
                return (
                  <tr key={id} className="border-b border-sky-100">
                    <td className="py-1 pr-1 text-slate-700">{r?.name ?? id}</td>
                    <td className="py-1">
                      <NumberInput
                        value={fc.backlog_units}
                        onChange={(v) => updateForecast(id, { backlog_units: v ?? 0 })}
                        step="1"
                        className="w-16"
                      />
                    </td>
                    <td className="py-1">
                      <NumberInput
                        value={fc.target_jph}
                        onChange={(v) => updateForecast(id, { target_jph: v })}
                        emptyAsNull
                        step="1"
                        className="w-16"
                      />
                    </td>
                    <td className="py-1 text-right font-mono font-semibold text-sky-800">
                      {fc.plan_lh.toFixed(1)}
                    </td>
                    <td className="py-1">
                      <div className="flex flex-wrap gap-0.5">
                        {attendees.map((m) => {
                          if (!m.login) return null;
                          const sel = (fc.assignees ?? []).includes(m.login);
                          return (
                            <button
                              key={m.login}
                              type="button"
                              onClick={() => {
                                const cur = fc.assignees ?? [];
                                const next = sel
                                  ? cur.filter((l) => l !== m.login)
                                  : [...cur, m.login!];
                                updateForecast(id, { assignees: next });
                              }}
                              className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
                                sel
                                  ? 'bg-sky-500 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Adhoc / KAIZEN */}
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/30 p-2 shadow-sm">
          <div className="mb-2 flex items-center justify-between rounded bg-amber-100 px-2 py-1">
            <span className="text-sm font-semibold text-amber-900">Adhoc / KAIZEN</span>
            <Button
              size="sm"
              variant="outline"
              onClick={addAdhoc}
              className="h-6 border-amber-300 bg-white text-xs text-amber-700 hover:bg-amber-50"
            >
              <Plus className="mr-1 h-3 w-3" />
              追加
            </Button>
          </div>
          <div className="space-y-1">
            {plan.adhoc_tasks.length === 0 && (
              <p className="text-center text-xs text-slate-400">追加タスクなし</p>
            )}
            {plan.adhoc_tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1 rounded border border-amber-200 bg-white px-1 py-1"
              >
                <Input
                  value={t.label}
                  onChange={(e) => updateAdhoc(t.id, { label: e.target.value })}
                  placeholder="作業名"
                  className="h-6 flex-1 text-xs"
                />
                <Input
                  value={t.who}
                  onChange={(e) => updateAdhoc(t.id, { who: e.target.value })}
                  placeholder="担当"
                  className="h-6 w-16 text-xs"
                />
                <NumberInput
                  value={t.need_lh}
                  onChange={(v) => updateAdhoc(t.id, { need_lh: v ?? 0 })}
                  className="w-14"
                />
                <NumberInput
                  value={t.progress}
                  onChange={(v) => updateAdhoc(t.id, { progress: v ?? 0 })}
                  step="5"
                  className="w-12"
                />
                <span className="text-[10px] text-slate-400">%</span>
                <button
                  type="button"
                  onClick={() => deleteAdhoc(t.id)}
                  className="rounded p-0.5 text-amber-600 hover:bg-amber-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly 進捗 (Phase ④-C: 曜日バッジ + 当日該当強調) */}
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/30 p-2 shadow-sm">
          <div className="mb-2 rounded bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-900">
            Weekly 進捗
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-emerald-200 text-left text-[10px] text-emerald-800">
                <th className="pb-1">項目</th>
                <th className="pb-1 text-center">曜日</th>
                <th className="pb-1 text-right">使用LH</th>
                <th className="pb-1 text-right">必要LH</th>
                <th className="pb-1 text-center">済</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const todayDow = getDow(date);
                return (routines?.weekly ?? []).map((w) => {
                  const wp = plan.weekly_progress[w.id] ?? {
                    done_lh: 0,
                    need_lh: w.default_need ?? 0,
                    completed: false,
                  };
                  const days = w.day_of_week ?? [];
                  const isToday = days.includes(todayDow);
                  const highlight = isToday && !wp.completed ? 'bg-amber-50' : '';
                  return (
                    <tr
                      key={w.id}
                      className={`border-b border-emerald-100 ${highlight}`}
                    >
                      <td className="py-1 pr-1 text-slate-700" title={w.name}>
                        {w.name}
                      </td>
                      <td className="py-1 text-center">
                        {days.length === 0 ? (
                          <span className="text-[9px] text-slate-400">-</span>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-0.5">
                            {days.map((d) => (
                              <span
                                key={d}
                                className={`rounded px-1 text-[9px] font-medium ${
                                  d === todayDow
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {DOW_LABELS[d]}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-1 text-right font-mono text-slate-500" title="過去の実績から自動計算予定">
                        {wp.done_lh > 0 ? wp.done_lh.toFixed(1) : '-'}
                      </td>
                      <td className="py-1 text-right font-mono text-slate-700">
                        {wp.need_lh > 0 ? wp.need_lh.toFixed(1) : '-'}
                      </td>
                      <td className="py-1 text-center">
                        <input
                          type="checkbox"
                          checked={wp.completed}
                          onChange={(e) =>
                            updateWeekly(w.id, { completed: e.target.checked })
                          }
                          className="h-4 w-4 accent-emerald-600"
                        />
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Role別セクション (plannedRoles ループ) ---- */}
      {rolesInPlan.map((role) => {
        const rc = getRolePanelClasses(role.color);
        const slots = getSlotLogins(plan, role.id);
        const candidates = candidatesByRole[role.id] ?? [];
        const rRoutines = routinesByRole[role.id] ?? [];
        const totalLh = slots.reduce((s, login) => {
          if (!login) return s;
          const a = totalAssignedLh(plan, login);
          const cs = plan.custom_routines
            .filter((c) => c.login === login && c.role === role.id)
            .reduce((x, c) => x + (c.lh ?? 0), 0);
          return s + a + cs;
        }, 0);
        const capacity = slots.reduce((s, login) => {
          if (!login) return s;
          const m = members.find((x) => x.login === login);
          return s + (m?.daily_hours ?? 7);
        }, 0);
        const slotCount = planSlots[role.id] ?? slots.length;

        return (
          <div
            key={role.id}
            className={`rounded-lg border-2 ${rc.sectionBorder} shadow-sm`}
          >
            <div className={`flex items-center justify-between rounded-t-md px-3 py-2 ${rc.headBg} ${rc.headText}`}>
              <span className="text-base font-semibold">
                {role.name}枠 ({slots.filter(Boolean).length}/{slotCount})
              </span>
              <span className="flex items-center gap-2 text-sm">
                <span className="font-medium">Plan LH</span>
                <span className={`rounded px-2 py-0.5 font-mono text-sm font-bold text-white shadow-sm ${rc.badgeBg}`}>
                  {totalLh.toFixed(1)} h
                </span>
                <span className={rc.accentText}>/</span>
                <span className="font-medium">容量</span>
                <span className="rounded bg-slate-600 px-2 py-0.5 font-mono text-sm font-semibold text-white shadow-sm">
                  {capacity.toFixed(1)} h
                </span>
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto p-2">
              {slots.map((login, i) => (
                <PersonColumn
                  key={`${role.id}-${i}`}
                  roleClasses={rc}
                  slotIndex={i}
                  login={login}
                  candidates={candidates}
                  routines={rRoutines}
                  assignments={login ? plan.assignments[login] ?? {} : {}}
                  customRoutines={plan.custom_routines.filter(
                    (c) => c.login === login && c.role === role.id,
                  )}
                  dailyHours={
                    login
                      ? members.find((m) => m.login === login)?.daily_hours ?? 7
                      : 7
                  }
                  onSelectLogin={(lg) => setSlotLogin(role.id, i, lg)}
                  onUpdateAssignment={(rid, lh) => login && updateAssignment(login, rid, lh)}
                  onAddCustomRoutine={() => login && addCustomRoutine(login, role.id)}
                  onUpdateCustomRoutine={updateCustomRoutine}
                  onDeleteCustomRoutine={deleteCustomRoutine}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
