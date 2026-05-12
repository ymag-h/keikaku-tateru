import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from './MembersTab';
import type { RoutinesFile } from './RoutinesTab';
import type { ShiftsFile } from './ShiftsTab';
import { todayISO, addDays, formatJaDay } from '@/lib/dateUtils';
import {
  getAttendees,
  totalCapacityLh,
  totalAssignedLh,
  computeActualTotalLh,
  computeActualByRoutine,
  type DailyPlan,
  type UserActual,
} from '@/lib/planUtils';

type Props = {
  members: Member[];
  routines: RoutinesFile | null;
  shifts: ShiftsFile | null;
};

export function DashboardTab({ members, routines, shifts }: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [actuals, setActuals] = useState<UserActual[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attendees = useMemo(
    () => getAttendees(members, shifts, date),
    [members, shifts, date],
  );
  const capacity = totalCapacityLh(attendees);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, actualsRes] = await Promise.all([
        window.api.readPlan(d),
        window.api.listActualsByDate(d),
      ]);
      setPlan(planRes.ok ? (planRes.data as DailyPlan) : null);
      setActuals(
        actualsRes.ok && actualsRes.actuals
          ? actualsRes.actuals.map((a) => a.data as UserActual)
          : [],
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const totalPlan = plan ? totalAssignedLh(plan) : 0;
  const totalAct = computeActualTotalLh(actuals);
  const actByRoutine = useMemo(() => computeActualByRoutine(actuals), [actuals]);

  // ルーチン別計画LH (assignments を集計)
  const planByRoutine = useMemo(() => {
    const result: Record<string, number> = {};
    if (!plan) return result;
    for (const rec of Object.values(plan.assignments)) {
      for (const [rid, lh] of Object.entries(rec)) {
        result[rid] = (result[rid] ?? 0) + (lh ?? 0);
      }
    }
    return result;
  }, [plan]);

  const progressPct = totalPlan > 0 ? (totalAct / totalPlan) * 100 : 0;

  const memberSummaries = useMemo(() => {
    return attendees.map((m) => {
      if (!m.login) return null;
      const planLh = Object.values(plan?.assignments[m.login] ?? {}).reduce(
        (s, v) => s + (v ?? 0),
        0,
      );
      const a = actuals.find((x) => x.login === m.login);
      const actLh = a
        ? Object.values(a.entries).reduce((s, e) => s + (e.act_lh ?? 0), 0)
        : 0;
      const hasActual = !!a;
      return { member: m, planLh, actLh, hasActual };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [attendees, plan, actuals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setDate(addDays(date, -1))}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-8 w-40 text-sm"
        />
        <Button
          size="icon"
          variant="outline"
          onClick={() => setDate(addDays(date, 1))}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDate(todayISO())} className="h-8">
          今日
        </Button>
        <span className="text-sm font-medium text-muted-foreground">{formatJaDay(date)}</span>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => load(date)}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          再読込
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">{error}</p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="出勤者" value={`${attendees.length}名`} />
        <SummaryCard
          label="計画 LH"
          value={`${totalPlan.toFixed(1)} / ${capacity.toFixed(1)}`}
          tone={totalPlan > capacity ? 'warn' : 'ok'}
        />
        <SummaryCard label="実績 LH" value={totalAct.toFixed(1)} />
        <SummaryCard
          label="進捗率"
          value={plan ? `${progressPct.toFixed(0)}%` : '-'}
          tone={
            progressPct >= 100
              ? 'ok'
              : progressPct >= 80
                ? 'warn'
                : progressPct > 0
                  ? 'warn'
                  : 'neutral'
          }
        />
      </div>

      {!plan ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded">
          この日の計画がまだ作成されていません (「計画マスタ」タブで作成してください)
        </p>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-semibold mb-2">ルーチン別 計画 vs 実績</h3>
            <div className="space-y-1">
              {routines?.daily
                .filter((r) => (planByRoutine[r.id] ?? 0) > 0 || (actByRoutine[r.id] ?? 0) > 0)
                .map((r) => {
                  const planLh = planByRoutine[r.id] ?? 0;
                  const actLh = actByRoutine[r.id] ?? 0;
                  const pct = planLh > 0 ? Math.min((actLh / planLh) * 100, 150) : 0;
                  const displayPct = planLh > 0 ? (actLh / planLh) * 100 : 0;
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[10rem_1fr_7rem] gap-2 items-center text-sm"
                    >
                      <div className="truncate" title={r.name}>
                        {r.name}
                      </div>
                      <div className="relative h-6 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${
                            displayPct >= 100
                              ? 'bg-green-500'
                              : displayPct >= 50
                                ? 'bg-yellow-400'
                                : 'bg-orange-300'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                        {displayPct > 100 && (
                          <div
                            className="absolute top-0 left-0 h-full bg-red-500 mix-blend-multiply"
                            style={{ width: `${Math.min(displayPct, 150)}%` }}
                          />
                        )}
                      </div>
                      <div className="text-right font-mono text-xs">
                        {actLh.toFixed(1)} / {planLh.toFixed(1)}
                        {planLh > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            ({displayPct.toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">メンバー別 進捗</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-1 font-medium">メンバー</th>
                    <th className="text-left py-2 px-1 font-medium w-16">role</th>
                    <th className="text-right py-2 px-1 font-medium w-24">計画 LH</th>
                    <th className="text-right py-2 px-1 font-medium w-24">実績 LH</th>
                    <th className="text-right py-2 px-1 font-medium w-20">進捗</th>
                    <th className="text-center py-2 px-1 font-medium w-20">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {memberSummaries.map(({ member, planLh, actLh, hasActual }) => {
                    const pct = planLh > 0 ? (actLh / planLh) * 100 : 0;
                    return (
                      <tr key={member.login} className="border-b last:border-0">
                        <td className="py-1 px-1 font-medium">{member.name}</td>
                        <td className="py-1 px-1 text-xs text-muted-foreground">
                          {member.role ?? 'QC'}
                        </td>
                        <td className="py-1 px-1 text-right font-mono">{planLh.toFixed(1)}</td>
                        <td className="py-1 px-1 text-right font-mono">{actLh.toFixed(1)}</td>
                        <td className="py-1 px-1 text-right font-mono">
                          {planLh > 0 ? `${pct.toFixed(0)}%` : '-'}
                        </td>
                        <td className="py-1 px-1 text-center">
                          {hasActual ? (
                            <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-900">
                              入力済
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              未入力
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {memberSummaries.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-muted-foreground py-4 text-sm"
                      >
                        出勤者なし
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
  const cls =
    tone === 'ok'
      ? 'bg-green-50 border-green-200'
      : tone === 'warn'
        ? 'bg-yellow-50 border-yellow-200'
        : tone === 'danger'
          ? 'bg-red-50 border-red-200'
          : 'bg-muted/40 border-border';
  return (
    <div className={`rounded border px-3 py-2 ${cls}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-mono font-semibold">{value}</div>
    </div>
  );
}
