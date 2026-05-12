import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from './MembersTab';
import type { DailyRoutine, RoutinesFile } from './RoutinesTab';
import type { ShiftsFile } from './ShiftsTab';
import type { Role, RolePanelClasses } from '@/lib/roles';
import { plannedRoles, getRolePanelClasses } from '@/lib/roles';
import {
  type DailyPlan,
  type UserActual,
  type ActualEntry,
  type CustomRoutine,
  type PlanSlots,
  routinesForRole,
  migratePlanToV11,
  getSlotLogins,
} from '@/lib/planUtils';
import { todayISO, addDays, formatJaDay } from '@/lib/dateUtils';
import { NumberInput } from './plans/NumberInput';

type Props = {
  members: Member[];
  routines: RoutinesFile | null;
  shifts: ShiftsFile | null;
  planSlots: PlanSlots;
  roles?: Role[];
};

type ActualsMap = Record<string, UserActual>;

export function ActualsInputTab({ members, routines, planSlots, roles }: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [actuals, setActuals] = useState<ActualsMap>({});
  const [dirtyLogins, setDirtyLogins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );

  const rolesInPlan = useMemo(() => plannedRoles(roles ?? []), [roles]);

  // --- ロード ---
  const loadAll = useCallback(async () => {
    if (!routines) return;
    setLoading(true);
    try {
      const p = await window.api.readPlan(date);
      if (p.ok && p.data) {
        setPlan(migratePlanToV11(p.data, routines, planSlots));
      } else {
        setPlan(null);
      }
      const r = await window.api.listActualsByDate(date);
      if (r.ok && r.actuals) {
        const map: ActualsMap = {};
        for (const a of r.actuals) {
          map[a.login] = a.data as UserActual;
        }
        setActuals(map);
      } else {
        setActuals({});
      }
      setDirtyLogins(new Set());
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [date, routines, planSlots]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // --- 保存 ---
  const save = async () => {
    if (dirtyLogins.size === 0) return;
    setSaving(true);
    const errors: string[] = [];
    for (const login of dirtyLogins) {
      const data = actuals[login];
      if (!data) continue;
      const r = await window.api.writeActual(login, date, {
        ...data,
        updated_at: new Date().toISOString(),
      });
      if (!r.ok) errors.push(`${login}: ${r.error}`);
    }
    setSaving(false);
    if (errors.length === 0) {
      setDirtyLogins(new Set());
      setStatus({ kind: 'ok', msg: `保存しました (${dirtyLogins.size}名)` });
      setTimeout(() => setStatus(null), 2500);
    } else {
      setStatus({ kind: 'error', msg: errors.join(' / ') });
    }
  };

  // --- entry 更新 ---
  const updateEntry = (
    login: string,
    routineId: string,
    patch: Partial<ActualEntry>,
  ) => {
    setActuals((prev) => {
      const cur: UserActual = prev[login] ?? {
        schema_version: '1.0.0',
        login,
        date,
        updated_at: new Date().toISOString(),
        entries: {},
      };
      const entries = { ...cur.entries };
      const e: ActualEntry = entries[routineId] ?? {
        act_lh: 0,
        job_units: null,
        done: false,
      };
      entries[routineId] = { ...e, ...patch };
      return { ...prev, [login]: { ...cur, entries } };
    });
    setDirtyLogins((d) => new Set(d).add(login));
  };

  // --- Role 別 計画メンバー + routines ---
  const membersByRole = useMemo(() => {
    const map: Record<string, Member[]> = {};
    for (const r of rolesInPlan) {
      const logins = (plan ? getSlotLogins(plan, r.id) : []).filter(
        (x): x is string => !!x,
      );
      map[r.id] = logins
        .map((l) => members.find((m) => m.login === l))
        .filter((m): m is Member => !!m);
    }
    return map;
  }, [plan, rolesInPlan, members]);

  const routinesByRole = useMemo(() => {
    const map: Record<string, DailyRoutine[]> = {};
    for (const r of rolesInPlan) {
      map[r.id] = routinesForRole(routines, r.id);
    }
    return map;
  }, [rolesInPlan, routines]);

  const getPlanLh = (login: string, routineId: string): number => {
    return plan?.assignments[login]?.[routineId] ?? 0;
  };
  const getEntry = (login: string, routineId: string): ActualEntry | null => {
    return actuals[login]?.entries[routineId] ?? null;
  };
  const getActDisplay = (login: string, routineId: string): number | null => {
    const entry = actuals[login]?.entries[routineId];
    if (entry && entry.act_lh !== undefined && entry.act_lh !== null) {
      return entry.act_lh > 0 ? entry.act_lh : null;
    }
    const planLh = getPlanLh(login, routineId);
    return planLh > 0 ? planLh : null;
  };
  const totalAct = (login: string): number => {
    const firstRoleId = rolesInPlan[0]?.id ?? 'QC';
    const mRole = members.find((m) => m.login === login)?.role ?? firstRoleId;
    const routinesForMember = routinesByRole[mRole] ?? [];
    let total = 0;
    for (const r of routinesForMember) {
      const v = getActDisplay(login, r.id);
      total += v ?? 0;
    }
    const custom = plan?.custom_routines.filter((c) => c.login === login) ?? [];
    for (const c of custom) {
      const entry = actuals[login]?.entries[c.id];
      if (entry && entry.act_lh !== undefined && entry.act_lh !== null) {
        total += entry.act_lh;
      } else {
        total += c.lh;
      }
    }
    return total;
  };

  const totalMembers = rolesInPlan.reduce(
    (s, r) => s + (membersByRole[r.id]?.length ?? 0),
    0,
  );

  if (!routines) {
    return <p className="text-sm text-muted-foreground p-6">loading…</p>;
  }

  // 計画確定 summary (例: "QC 3 / Sub 1")
  const summaryText = rolesInPlan
    .map((r) => `${r.name} ${membersByRole[r.id]?.length ?? 0}`)
    .join(' / ');

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ---- トップバー ---- */}
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

        <span className="text-xs text-slate-500">
          計画確定: {totalMembers}名 ({summaryText})
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadAll}
            disabled={loading}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            再読込
          </Button>
          {status && (
            <span
              className={`text-xs ${
                status.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {status.msg}
            </span>
          )}
          {dirtyLogins.size > 0 && (
            <span className="text-xs text-amber-600">
              未保存 {dirtyLogins.size}名
            </span>
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={saving || dirtyLogins.size === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="mr-1 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>

      {!plan && (
        <p className="py-8 text-center text-sm text-amber-600">
          この日の計画が未作成です (計画マスタで作成してください)
        </p>
      )}

      {plan && totalMembers === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          計画マスタで枠にメンバーが割り当てられていません
        </p>
      )}

      {/* ---- Role別セクション ---- */}
      {rolesInPlan.map((role) => {
        const roleMembers = membersByRole[role.id] ?? [];
        if (roleMembers.length === 0) return null;
        const rc = getRolePanelClasses(role.color);
        const rRoutines = routinesByRole[role.id] ?? [];
        return (
          <div
            key={role.id}
            className={`rounded-lg border-2 ${rc.sectionBorder} shadow-sm`}
          >
            <div className={`flex items-center justify-between rounded-t-md px-3 py-2 ${rc.headBg}`}>
              <span className={`text-base font-semibold ${rc.headText}`}>
                {role.name} ({roleMembers.length}名)
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto p-2">
              {roleMembers.map((m) => (
                <ActualCard
                  key={m.login}
                  roleClasses={rc}
                  member={m}
                  routines={rRoutines}
                  customRoutines={
                    plan?.custom_routines.filter(
                      (c) => c.login === m.login && c.role === role.id,
                    ) ?? []
                  }
                  getPlanLh={(id) => getPlanLh(m.login, id)}
                  getEntry={(id) => getEntry(m.login, id)}
                  getActDisplay={(id) => getActDisplay(m.login, id)}
                  updateEntry={(id, patch) => updateEntry(m.login, id, patch)}
                  actTotal={totalAct(m.login)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =========================================================
// メンバー別カード
// =========================================================
type CardProps = {
  roleClasses: RolePanelClasses;
  member: Member;
  routines: DailyRoutine[];
  customRoutines: CustomRoutine[];
  getPlanLh: (routineId: string) => number;
  getEntry: (routineId: string) => ActualEntry | null;
  getActDisplay: (routineId: string) => number | null;
  updateEntry: (routineId: string, patch: Partial<ActualEntry>) => void;
  actTotal: number;
};

function ActualCard({
  roleClasses,
  member,
  routines,
  customRoutines,
  getPlanLh,
  getEntry,
  getActDisplay,
  updateEntry,
  actTotal,
}: CardProps) {
  const daily_hours = member.daily_hours ?? 7;
  const overCapacity = actTotal > daily_hours + 0.001;
  const remaining = daily_hours - actTotal;
  const badgeColor = overCapacity
    ? 'bg-red-600'
    : remaining < 0.5
      ? 'bg-amber-500'
      : 'bg-emerald-600';

  return (
    <div
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg border-2 ${roleClasses.columnBorder} bg-white shadow-sm`}
    >
      <div className={`flex items-center gap-2 rounded-t-md px-2 py-2 ${roleClasses.columnHeadBg} ${roleClasses.columnHeadText}`}>
        <span className="flex-1 font-semibold">
          {member.name}
          <span className="ml-1 text-xs font-normal text-slate-600">
            ({member.login})
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        <div className="mb-1 flex items-center gap-1 border-b-2 border-slate-300 px-1 pb-1 text-[11px] font-bold text-slate-600">
          <span className="flex-1">Task名</span>
          <span className="w-14 text-right">Plan</span>
          <span className="w-20 text-center">Act LH</span>
          <span className="w-14 text-center">Job</span>
        </div>

        <div className="space-y-0.5">
          {routines.map((r) => {
            const plan = getPlanLh(r.id);
            const entry = getEntry(r.id);
            const actDisplay = getActDisplay(r.id);
            const job = entry?.job_units ?? null;
            return (
              <div
                key={r.id}
                className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-50"
              >
                <span className="flex-1 truncate text-xs text-slate-700" title={r.name}>
                  {r.name}
                </span>
                <span
                  className={`w-14 text-right font-mono text-xs ${
                    plan > 0 ? 'text-blue-700' : 'text-slate-400'
                  }`}
                >
                  {plan > 0 ? plan.toFixed(1) : '-'}
                </span>
                <NumberInput
                  value={actDisplay}
                  onChange={(v) => updateEntry(r.id, { act_lh: v ?? 0 })}
                  emptyAsNull
                  highlight
                  showSpinner
                  step="0.1"
                  className="w-20"
                />
                {r.jobs_count ? (
                  <NumberInput
                    value={job}
                    onChange={(v) => updateEntry(r.id, { job_units: v })}
                    step="1"
                    emptyAsNull
                    className="w-14"
                  />
                ) : (
                  <span className="w-14 text-right text-xs text-slate-300">-</span>
                )}
              </div>
            );
          })}
        </div>

        {customRoutines.length > 0 && (
          <>
            <div className="my-1 flex items-center gap-1 text-[10px] text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              <span>臨時 (計画で追加)</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="space-y-0.5">
              {customRoutines.map((c) => {
                const entry = getEntry(c.id);
                const actDisplay =
                  entry && entry.act_lh !== undefined && entry.act_lh !== null
                    ? entry.act_lh > 0
                      ? entry.act_lh
                      : null
                    : c.lh > 0
                      ? c.lh
                      : null;
                const job = entry?.job_units ?? null;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50/50 px-1 py-0.5"
                  >
                    <span className="flex-1 truncate text-xs italic text-slate-700" title={c.label}>
                      {c.label || '(臨時)'}
                    </span>
                    <span className="w-14 text-right font-mono text-xs text-blue-700">
                      {c.lh.toFixed(1)}
                    </span>
                    <NumberInput
                      value={actDisplay}
                      onChange={(v) => updateEntry(c.id, { act_lh: v ?? 0 })}
                      emptyAsNull
                      highlight
                      showSpinner
                      step="0.1"
                      className="w-20"
                    />
                    <NumberInput
                      value={job}
                      onChange={(v) => updateEntry(c.id, { job_units: v })}
                      step="1"
                      emptyAsNull
                      className="w-14"
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-2 space-y-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">実績 LH</span>
            <span
              className={`rounded px-2.5 py-1 font-mono text-base font-bold text-white shadow-sm ${roleClasses.badgeBg}`}
            >
              {actTotal.toFixed(2)} h
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">容量</span>
            <span className="rounded bg-slate-600 px-2.5 py-1 font-mono text-base font-semibold text-white shadow-sm">
              {daily_hours.toFixed(1)} h
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-300 pt-1.5">
            <span className="font-medium text-slate-700">残</span>
            <span
              className={`rounded px-2.5 py-1 font-mono text-base font-bold text-white shadow-sm ${badgeColor}`}
            >
              {remaining.toFixed(2)} h
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
