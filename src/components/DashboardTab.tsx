import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Send, Trash2, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from './MembersTab';
import type { RoutinesFile } from './RoutinesTab';
import type { ShiftsFile } from './ShiftsTab';
import type { Role } from '@/lib/roles';
import { todayISO, addDays, formatJaDay, getDow, DOW_LABELS } from '@/lib/dateUtils';
import {
  getAttendees,
  totalCapacityLh,
  totalAssignedLh,
  computeActualTotalLh,
  computeActualByRoutine,
  forecastRoutineIds,
  type DailyPlan,
  type UserActual,
  type PlanSlots,
} from '@/lib/planUtils';
import { getLocalUserLogin } from '@/lib/localPrefs';

type Props = {
  members: Member[];
  routines: RoutinesFile | null;
  shifts: ShiftsFile | null;
  planSlots: PlanSlots;
  roles?: Role[];
};

type RangeMode = '1w' | '1m';
type BoardPost = { id: string; author: string; body: string; ts: string };

function daysAgo(base: string, n: number): string { return addDays(base, -n); }

const LINE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
];

export function DashboardTab({ members, routines, shifts, planSlots }: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [actuals, setActuals] = useState<UserActual[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rangeMode, setRangeMode] = useState<RangeMode>('1w');
  const [rangeData, setRangeData] = useState<
    Array<{ date: string; jobs: Record<string, number> }>
  >([]);

  // 折れ線グラフ: 非表示ルーチンID
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [newBody, setNewBody] = useState('');
  const currentUser = getLocalUserLogin() ?? '';

  const attendees = useMemo(
    () => getAttendees(members, shifts, date),
    [members, shifts, date],
  );
  const capacity = totalCapacityLh(attendees);

  /* ---- データ読込 ---- */
  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, actualsRes] = await Promise.all([
        window.api.readPlan(d),
        window.api.listActualsByDate(d),
      ]);
      if (planRes.ok && planRes.data) {
        setPlan(planRes.data as DailyPlan);
      } else {
        setPlan(null);
      }
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

  const loadRange = useCallback(
    async (d: string, mode: RangeMode) => {
      if (!routines) return;
      const days = mode === '1w' ? 7 : 30;
      const start = daysAgo(d, days - 1);
      const end = d;
      try {
        const res = await window.api.listActualsByRange(start, end);
        if (!res.ok || !res.actuals) return;
        const byDate: Record<string, Record<string, number>> = {};
        for (const a of res.actuals) {
          const ua = a.data as UserActual;
          if (!byDate[a.date]) byDate[a.date] = {};
          for (const [rid, entry] of Object.entries(ua.entries)) {
            if (typeof entry.job_units === 'number' && entry.job_units > 0) {
              byDate[a.date][rid] = (byDate[a.date][rid] ?? 0) + entry.job_units;
            }
          }
        }
        const result: typeof rangeData = [];
        let cur = start;
        while (cur <= end) {
          result.push({ date: cur, jobs: byDate[cur] ?? {} });
          cur = addDays(cur, 1);
        }
        setRangeData(result);
      } catch {
        /* ignore */
      }
    },
    [routines],
  );

  const loadBoard = useCallback(async () => {
    try {
      const res = await window.api.readBoard();
      if (res.ok) setPosts(res.posts);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(date); }, [date, load]);
  useEffect(() => { loadRange(date, rangeMode); }, [date, rangeMode, loadRange]);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  /* ---- 集計 ---- */
  const totalPlan = plan ? totalAssignedLh(plan) : 0;
  const totalAct = computeActualTotalLh(actuals);
  const actByRoutine = useMemo(() => computeActualByRoutine(actuals), [actuals]);
  const planByRoutine = useMemo(() => {
    const r: Record<string, number> = {};
    if (!plan) return r;
    for (const rec of Object.values(plan.assignments)) {
      for (const [rid, lh] of Object.entries(rec)) {
        r[rid] = (r[rid] ?? 0) + (lh ?? 0);
      }
    }
    return r;
  }, [plan]);
  const progressPct = totalPlan > 0 ? (totalAct / totalPlan) * 100 : 0;

  const memberSummaries = useMemo(() => {
    return attendees.map((m) => {
      if (!m.login) return null;
      const planLh = Object.values(plan?.assignments[m.login] ?? {}).reduce(
        (s, v) => s + (v ?? 0), 0);
      const a = actuals.find((x) => x.login === m.login);
      const actLh = a
        ? Object.values(a.entries).reduce((s, e) => s + (e.act_lh ?? 0), 0) : 0;
      return { member: m, planLh, actLh, hasActual: !!a };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [attendees, plan, actuals]);

  /* ---- Job Count ルーチン + グラフ計算 ---- */
  const jobRoutines = useMemo(() => {
    if (!routines) return [];
    return routines.daily
      .filter((r) => r.jobs_count)
      .sort((a, b) => a.order - b.order);
  }, [routines]);

  const chartMax = useMemo(() => {
    let mx = 1;
    for (const d of rangeData) {
      for (const r of jobRoutines) {
        if (!hiddenIds.has(r.id)) {
          mx = Math.max(mx, d.jobs[r.id] ?? 0);
        }
      }
    }
    return mx;
  }, [rangeData, jobRoutines, hiddenIds]);

  // 折れ線ジオメトリ
  const xStep = rangeMode === '1w' ? 100 : 28;
  const chartW = Math.max(rangeData.length * xStep, 300);
  const chartH = 150;
  const padT = 10;
  const padB = 22;
  const plotH = chartH - padT - padB;
  const getX = (idx: number) => idx * xStep + xStep / 2;
  const getY = (val: number) =>
    padT + plotH * (1 - (chartMax > 0 ? val / chartMax : 0));

  const toggleRoutine = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ---- 掲示板操作 ---- */
  const addPost = async () => {
    if (!newBody.trim() || !currentUser) return;
    const post: BoardPost = {
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      author: currentUser,
      body: newBody.trim(),
      ts: new Date().toISOString(),
    };
    const next = [post, ...posts];
    setPosts(next);
    setNewBody('');
    await window.api.writeBoard(next);
  };

  const deletePost = async (id: string) => {
    const next = posts.filter((p) => p.id !== id);
    setPosts(next);
    await window.api.writeBoard(next);
  };

  const memberName = (login: string) =>
    members.find((m) => m.login === login)?.name ?? login;

  /* ---- Weekly 進捗 (完了を末尾ソート) ---- */
  const weeklyItems = useMemo(() => {
    if (!plan || !routines) return [];
    return (routines.weekly ?? []).map((w) => {
      const wp = plan.weekly_progress[w.id] ?? {
        done_lh: 0, need_lh: w.default_need ?? 0, completed: false,
      };
      const pct = wp.need_lh > 0 ? Math.min((wp.done_lh / wp.need_lh) * 100, 100) : 0;
      return { ...w, wp, pct };
    });
  }, [plan, routines]);

  const sortedWeekly = useMemo(() => {
    return [...weeklyItems].sort((a, b) => Number(a.wp.completed) - Number(b.wp.completed));
  }, [weeklyItems]);

  /* ============================================ */
  /* ================ JSX ====================== */
  /* ============================================ */
  return (
    <div className="space-y-4">
      {/* ---- ヘッダー ---- */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="icon" variant="outline" onClick={() => setDate(addDays(date, -1))} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-8 w-40 text-sm" />
        <Button size="icon" variant="outline" onClick={() => setDate(addDays(date, 1))} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDate(todayISO())} className="h-8">今日</Button>
        <span className="text-sm font-medium text-muted-foreground">{formatJaDay(date)}</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => load(date)} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          再読込
        </Button>
      </div>

      {error && <p className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">{error}</p>}

      {/* ---- KPI カード ---- */}
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
            progressPct >= 100 ? 'ok'
              : progressPct >= 80 ? 'warn'
                : progressPct > 0 ? 'warn' : 'neutral'
          }
        />
      </div>

      {/* ---- Job Count 推移 (折れ線グラフ) ---- */}
      {jobRoutines.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Job Count 推移</h3>
            <div className="flex gap-1">
              {(['1w', '1m'] as RangeMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setRangeMode(m)}
                  className={`px-2 py-0.5 text-xs rounded ${
                    rangeMode === m
                      ? 'bg-slate-900 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-slate-200'
                  }`}
                >
                  {m === '1w' ? '1週間' : '1か月'}
                </button>
              ))}
            </div>
          </div>

          {/* 凡例 (クリックで表示切替) */}
          <div className="flex flex-wrap gap-2 mb-2 text-[10px]">
            {jobRoutines.map((r, i) => {
              const hidden = hiddenIds.has(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggleRoutine(r.id)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-opacity ${
                    hidden ? 'opacity-30' : 'opacity-100'
                  } hover:bg-muted`}
                >
                  <span
                    className="inline-block w-4 h-[3px] rounded"
                    style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
                  />
                  <span className={hidden ? 'line-through' : ''}>{r.name}</span>
                </button>
              );
            })}
          </div>

          {/* SVG 折れ線グラフ */}
          <div className="overflow-x-auto">
            {rangeData.length > 0 ? (
              <svg width={chartW} height={chartH} className="select-none">
                {/* 水平グリッド */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <line
                    key={f}
                    x1={0} y1={getY(chartMax * f)}
                    x2={chartW} y2={getY(chartMax * f)}
                    stroke="#e2e8f0" strokeWidth={0.5}
                  />
                ))}
                <line x1={0} y1={getY(0)} x2={chartW} y2={getY(0)}
                  stroke="#cbd5e1" strokeWidth={1} />

                {/* 当日ハイライト */}
                {rangeData.map((d, idx) =>
                  d.date === todayISO() ? (
                    <rect
                      key="today-bg"
                      x={getX(idx) - xStep / 2} y={0}
                      width={xStep} height={chartH - padB}
                      fill="#fef3c7" opacity={0.5} rx={4}
                    />
                  ) : null,
                )}

                {/* 折れ線 */}
                {jobRoutines
                  .filter((r) => !hiddenIds.has(r.id))
                  .map((r) => {
                    const ci = jobRoutines.indexOf(r);
                    const pts = rangeData
                      .map((d, idx) => `${getX(idx)},${getY(d.jobs[r.id] ?? 0)}`)
                      .join(' ');
                    return (
                      <polyline
                        key={r.id}
                        points={pts}
                        fill="none"
                        stroke={LINE_COLORS[ci % LINE_COLORS.length]}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    );
                  })}

                {/* データポイント */}
                {jobRoutines
                  .filter((r) => !hiddenIds.has(r.id))
                  .map((r) => {
                    const ci = jobRoutines.indexOf(r);
                    return rangeData.map((d, idx) => {
                      const v = d.jobs[r.id] ?? 0;
                      return (
                        <circle
                          key={`${r.id}-${d.date}`}
                          cx={getX(idx)} cy={getY(v)}
                          r={rangeMode === '1w' ? 3.5 : 2}
                          fill="white"
                          stroke={LINE_COLORS[ci % LINE_COLORS.length]}
                          strokeWidth={1.5}
                        >
                          <title>{`${d.date} ${r.name}: ${v}`}</title>
                        </circle>
                      );
                    });
                  })}

                {/* X軸ラベル */}
                {rangeData.map((d, idx) => {
                  const dow = getDow(d.date);
                  const isToday = d.date === todayISO();
                  return (
                    <text
                      key={d.date}
                      x={getX(idx)} y={chartH - 4}
                      textAnchor="middle"
                      fill={isToday ? '#b45309' : '#94a3b8'}
                      fontWeight={isToday ? 'bold' : 'normal'}
                      fontSize={rangeMode === '1w' ? 10 : 8}
                    >
                      {rangeMode === '1w'
                        ? `${d.date.slice(5)} ${DOW_LABELS[dow]}`
                        : d.date.slice(8)}
                    </text>
                  );
                })}
              </svg>
            ) : (
              <p className="text-xs text-muted-foreground py-8 w-full text-center">
                データなし
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- 下段 2カラム: 左(ルーチン別+メンバー別)  右(Weekly+掲示板) ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左半分 */}
        <div className="space-y-4">
          {/* ルーチン別 計画 vs 実績 */}
          {plan && (
            <div className="rounded-lg border bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold mb-2">ルーチン別 計画 vs 実績</h3>
              <div className="space-y-1">
                {routines?.daily
                  .filter((r) => (planByRoutine[r.id] ?? 0) > 0 || (actByRoutine[r.id] ?? 0) > 0)
                  .map((r) => {
                    const pLh = planByRoutine[r.id] ?? 0;
                    const aLh = actByRoutine[r.id] ?? 0;
                    const pct = pLh > 0 ? Math.min((aLh / pLh) * 100, 150) : 0;
                    const dp = pLh > 0 ? (aLh / pLh) * 100 : 0;
                    return (
                      <div key={r.id} className="grid grid-cols-[10rem_1fr_7rem] gap-2 items-center text-sm">
                        <div className="truncate" title={r.name}>{r.name}</div>
                        <div className="relative h-5 bg-muted rounded overflow-hidden">
                          <div
                            className={`h-full ${
                              dp >= 100 ? 'bg-green-500' : dp >= 50 ? 'bg-yellow-400' : 'bg-orange-300'
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <div className="text-right font-mono text-xs">
                          {aLh.toFixed(1)} / {pLh.toFixed(1)}
                          {pLh > 0 && (
                            <span className="ml-1 text-muted-foreground">({dp.toFixed(0)}%)</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* メンバー別 進捗 */}
          {plan && (
            <div className="rounded-lg border bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold mb-2">メンバー別 進捗</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-1 px-1 font-medium">メンバー</th>
                    <th className="text-left py-1 px-1 font-medium w-16">role</th>
                    <th className="text-right py-1 px-1 font-medium w-20">計画</th>
                    <th className="text-right py-1 px-1 font-medium w-20">実績</th>
                    <th className="text-right py-1 px-1 font-medium w-16">進捗</th>
                    <th className="text-center py-1 px-1 font-medium w-16">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {memberSummaries.map(({ member, planLh, actLh, hasActual }) => {
                    const pct = planLh > 0 ? (actLh / planLh) * 100 : 0;
                    return (
                      <tr key={member.login} className="border-b last:border-0">
                        <td className="py-1 px-1 font-medium">{member.name}</td>
                        <td className="py-1 px-1 text-xs text-muted-foreground">{member.role ?? 'QC'}</td>
                        <td className="py-1 px-1 text-right font-mono text-xs">{planLh.toFixed(1)}</td>
                        <td className="py-1 px-1 text-right font-mono text-xs">{actLh.toFixed(1)}</td>
                        <td className="py-1 px-1 text-right font-mono text-xs">
                          {planLh > 0 ? `${pct.toFixed(0)}%` : '-'}
                        </td>
                        <td className="py-1 px-1 text-center">
                          {hasActual ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-900">入力済</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">未入力</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {memberSummaries.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-muted-foreground py-4 text-sm">出勤者なし</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!plan && (
            <p className="text-sm text-muted-foreground py-8 text-center border rounded">
              この日の計画がまだ作成されていません
            </p>
          )}
        </div>

        {/* 右半分: Weekly 進捗 + 掲示板 */}
        <div className="space-y-4">
          {/* Weekly 進捗 */}
          {sortedWeekly.length > 0 && (
            <div className="rounded-lg border bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold mb-2">Weekly 進捗</h3>
              <div className="space-y-1">
                {sortedWeekly.map((w) => (
                  <div
                    key={w.id}
                    className="relative rounded overflow-hidden"
                  >
                    {/* 薄い背景バー */}
                    <div
                      className={`absolute inset-y-0 left-0 transition-all ${
                        w.wp.completed
                          ? 'bg-green-100'
                          : w.pct > 0
                            ? 'bg-blue-100'
                            : 'bg-muted/20'
                      }`}
                      style={{ width: w.wp.completed ? '100%' : `${w.pct}%` }}
                    />
                    {/* テキストコンテンツ (バーの上) */}
                    <div className="relative flex items-center justify-between px-2 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm truncate" title={w.name}>{w.name}</span>
                        {w.wp.completed ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-200/80 text-green-800 whitespace-nowrap shrink-0">
                            完了
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 whitespace-nowrap shrink-0">
                            未完了
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono shrink-0 ml-2">
                        <span className="text-muted-foreground">
                          必要 {w.wp.need_lh.toFixed(1)}h
                        </span>
                        {w.wp.done_lh > 0 && (
                          <span className="text-blue-600">
                            使用 {w.wp.done_lh.toFixed(1)}h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 掲示板 */}
          <div className="rounded-lg border bg-white p-3 shadow-sm flex flex-col" style={{ maxHeight: 600 }}>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold">掲示板</h3>
            </div>
            <div className="flex gap-1 mb-2">
              <Input
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addPost(); } }}
                placeholder={currentUser ? '連絡事項を投稿...' : '設定でユーザーIDを選択してください'}
                disabled={!currentUser}
                className="h-8 text-xs flex-1"
              />
              <Button size="icon" variant="outline" onClick={addPost}
                disabled={!currentUser || !newBody.trim()} className="h-8 w-8">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {posts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">投稿なし</p>
              )}
              {posts.slice(0, 30).map((p) => (
                <div key={p.id} className="rounded border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">
                      {memberName(p.author)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(p.ts).toLocaleString('ja-JP', {
                          month: 'numeric', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      {p.author === currentUser && (
                        <button
                          onClick={() => deletePost(p.id)}
                          className="text-slate-400 hover:text-red-500 p-0.5"
                          title="削除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap mt-0.5">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, tone = 'neutral',
}: {
  label: string; value: string; tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
  const cls =
    tone === 'ok' ? 'bg-green-50 border-green-200'
      : tone === 'warn' ? 'bg-yellow-50 border-yellow-200'
        : tone === 'danger' ? 'bg-red-50 border-red-200'
          : 'bg-muted/40 border-border';
  return (
    <div className={`rounded border px-3 py-2 ${cls}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-mono font-semibold">{value}</div>
    </div>
  );
}
