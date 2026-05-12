import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from './MembersTab';
import type { RoutinesFile } from './RoutinesTab';
import type { UserActual } from '@/lib/planUtils';
import { addDays, todayISO } from '@/lib/dateUtils';

type Props = {
  members: Member[];
  routines: RoutinesFile | null;
};

type RangeActual = { login: string; date: string; data: UserActual };

type AggCell = { act_lh: number; jobs: number; days: number };
type AggMap = Record<string, Record<string, AggCell>>;

export function ProductivityTab({ members, routines }: Props) {
  const [end, setEnd] = useState<string>(todayISO());
  const [start, setStart] = useState<string>(addDays(todayISO(), -29));
  const [records, setRecords] = useState<RangeActual[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await window.api.listActualsByRange(start, end);
      if (r.ok && r.actuals) {
        setRecords(r.actuals.map((x) => ({ ...x, data: x.data as UserActual })));
      } else {
        setRecords([]);
        if (r.error) setError(r.error);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const agg: AggMap = useMemo(() => {
    const m: AggMap = {};
    for (const rec of records) {
      const { login, data } = rec;
      if (!m[login]) m[login] = {};
      for (const [rid, e] of Object.entries(data.entries ?? {})) {
        if (!m[login][rid]) {
          m[login][rid] = { act_lh: 0, jobs: 0, days: 0 };
        }
        m[login][rid].act_lh += e.act_lh ?? 0;
        m[login][rid].jobs += e.job_units ?? 0;
        if ((e.act_lh ?? 0) > 0 || (e.job_units ?? 0) > 0) {
          m[login][rid].days += 1;
        }
      }
    }
    return m;
  }, [records]);

  const countRoutines = useMemo(
    () =>
      (routines?.daily ?? [])
        .filter((r) => r.jobs_count)
        .sort((a, b) => a.order - b.order),
    [routines],
  );

  const workDays: Record<string, number> = useMemo(() => {
    const set: Record<string, Set<string>> = {};
    for (const rec of records) {
      if (!set[rec.login]) set[rec.login] = new Set();
      const hasActual = Object.values(rec.data.entries ?? {}).some(
        (e) => (e.act_lh ?? 0) > 0 || (e.job_units ?? 0) > 0,
      );
      if (hasActual) set[rec.login].add(rec.date);
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(set)) out[k] = v.size;
    return out;
  }, [records]);

  const sortedMembers = useMemo(
    () => members.filter((m) => (workDays[m.login] ?? 0) > 0 || agg[m.login]),
    [members, workDays, agg],
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <CalendarRange className="h-4 w-4 text-slate-500" />
        <span className="text-xs text-slate-600">期間</span>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-8 w-36 text-sm"
        />
        <span className="text-slate-400">〜</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-8 w-36 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEnd(todayISO());
            setStart(addDays(todayISO(), -29));
          }}
        >
          過去30日
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEnd(todayISO());
            setStart(addDays(todayISO(), -6));
          }}
        >
          過去7日
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{records.length}件</span>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            再読込
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}

      {sortedMembers.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          該当期間に実績データがありません
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-slate-100 text-slate-700">
                <th className="sticky left-0 z-10 border-r bg-slate-100 px-2 py-2 text-left font-semibold">
                  メンバー
                </th>
                <th className="border-r px-2 py-2 text-center font-semibold">role</th>
                <th className="border-r px-2 py-2 text-center font-semibold">勤務日</th>
                <th className="border-r px-2 py-2 text-right font-semibold">総 Act LH</th>
                {countRoutines.map((r) => (
                  <th
                    key={r.id}
                    className="border-r px-2 py-2 text-center font-semibold"
                    colSpan={4}
                    title={r.id}
                  >
                    {r.name}
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-slate-50 text-[10px] text-slate-600">
                <th className="sticky left-0 z-10 border-r bg-slate-50 px-2 py-1"></th>
                <th className="border-r px-2 py-1"></th>
                <th className="border-r px-2 py-1"></th>
                <th className="border-r px-2 py-1"></th>
                {countRoutines.map((r) => (
                  <>
                    <th
                      key={`${r.id}-lh`}
                      className="px-1 py-1 text-right font-medium"
                      title="実績LH合計"
                    >
                      LH
                    </th>
                    <th
                      key={`${r.id}-jobs`}
                      className="px-1 py-1 text-right font-medium"
                      title="処理件数合計"
                    >
                      件
                    </th>
                    <th
                      key={`${r.id}-uph`}
                      className="px-1 py-1 text-right font-medium"
                      title="実績 UPH (件/LH)"
                    >
                      UPH
                    </th>
                    <th
                      key={`${r.id}-vs`}
                      className="border-r px-1 py-1 text-right font-medium"
                      title="目標 UPH (members.uph) との比率"
                    >
                      vs目標
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
                const totalActLh = Object.values(agg[m.login] ?? {}).reduce(
                  (s, c) => s + c.act_lh,
                  0,
                );
                return (
                  <tr
                    key={m.login}
                    className="border-b last:border-0 hover:bg-slate-50"
                  >
                    <td className="sticky left-0 z-10 border-r bg-white px-2 py-1.5 font-medium">
                      {m.name}
                      <span className="ml-1 text-[10px] text-slate-400">({m.login})</span>
                    </td>
                    <td className="border-r px-2 py-1.5 text-center text-[11px] text-slate-600">
                      {m.role ?? 'QC'}
                    </td>
                    <td className="border-r px-2 py-1.5 text-center font-mono">
                      {workDays[m.login] ?? 0}
                    </td>
                    <td className="border-r px-2 py-1.5 text-right font-mono font-semibold text-slate-700">
                      {totalActLh.toFixed(1)}
                    </td>
                    {countRoutines.map((r) => {
                      const cell = agg[m.login]?.[r.id];
                      const lh = cell?.act_lh ?? 0;
                      const jobs = cell?.jobs ?? 0;
                      const uph = lh > 0 ? jobs / lh : 0;
                      const target = m.uph?.[r.id];
                      const ratio = target && target > 0 && uph > 0 ? uph / target : null;
                      const ratioCls =
                        ratio == null
                          ? 'text-slate-400'
                          : ratio >= 1
                            ? 'text-emerald-700 font-semibold'
                            : ratio >= 0.85
                              ? 'text-amber-700'
                              : 'text-red-700';
                      return (
                        <>
                          <td
                            key={`${r.id}-lh-${m.login}`}
                            className={`px-1 py-1.5 text-right font-mono ${
                              lh > 0 ? 'text-slate-700' : 'text-slate-300'
                            }`}
                          >
                            {lh > 0 ? lh.toFixed(1) : '-'}
                          </td>
                          <td
                            key={`${r.id}-jobs-${m.login}`}
                            className={`px-1 py-1.5 text-right font-mono ${
                              jobs > 0 ? 'text-slate-700' : 'text-slate-300'
                            }`}
                          >
                            {jobs > 0 ? jobs : '-'}
                          </td>
                          <td
                            key={`${r.id}-uph-${m.login}`}
                            className={`px-1 py-1.5 text-right font-mono ${
                              uph > 0 ? 'text-blue-700 font-semibold' : 'text-slate-300'
                            }`}
                          >
                            {uph > 0 ? uph.toFixed(1) : '-'}
                          </td>
                          <td
                            key={`${r.id}-vs-${m.login}`}
                            className={`border-r px-1 py-1.5 text-right font-mono ${ratioCls}`}
                          >
                            {ratio != null ? `${(ratio * 100).toFixed(0)}%` : '-'}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="font-semibold">凡例:</span>
        <span>LH = 実績労働時間 (h)</span>
        <span>件 = 処理件数</span>
        <span>UPH = 件数 / LH</span>
        <span>vs目標 = 実績UPH / members.uph × 100</span>
        <span className="text-emerald-700 font-semibold">≥100%</span>
        <span className="text-amber-700">85-99%</span>
        <span className="text-red-700">&lt;85%</span>
      </div>
    </div>
  );
}
