import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from './MembersTab';
import type { RoutinesFile } from './RoutinesTab';
import type { Role } from '@/lib/roles';
import { plannedRoles } from '@/lib/roles';
import type { AppMeta } from './settings/GeneralPane';
import {
  type DailyPlan,
  type UserActual,
  type ActualEntry,
  type PlanSlots,
  routinesForRole,
  migratePlanToV11,
  getSlotLogins,
} from '@/lib/planUtils';
import { todayISO, addDays, formatJaDay } from '@/lib/dateUtils';
import { PlanPostingView } from './distribution/PlanPostingView';
import { ActualsPostingView } from './distribution/ActualsPostingView';

type Props = {
  members: Member[];
  routines: RoutinesFile | null;
  planSlots: PlanSlots;
  roles?: Role[];
  meta?: AppMeta | null;
};

type ActualsMap = Record<string, UserActual>;
type Mode = 'plan' | 'actuals';

export function ActualsTab({ members, routines, planSlots, roles, meta }: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [actuals, setActuals] = useState<ActualsMap>({});
  const [dirtyLogins, setDirtyLogins] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>('plan');
  const [zoom, setZoom] = useState<number>(0.7);
  const captureRef = useRef<HTMLDivElement>(null);

  // --- ロード ---
  const loadAll = useCallback(async () => {
    if (!routines) return;
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
      setTimeout(() => setStatus(null), 2000);
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

  // --- 投稿テキスト (Role別ループ動的化) ---
  const buildPostText = (): string => {
    if (!plan || !routines) return '';
    const rolesInPlan = plannedRoles(roles ?? []);

    const getActLh = (login: string | null, id: string) =>
      login ? actuals[login]?.entries[id]?.act_lh ?? 0 : 0;
    const getJob = (login: string | null, id: string) =>
      login ? actuals[login]?.entries[id]?.job_units ?? null : null;
    const getPlanLh = (login: string | null, id: string) =>
      login ? plan.assignments[login]?.[id] ?? 0 : 0;

    const lines: string[] = [];
    lines.push(`${formatJaDay(date)} ${mode === 'plan' ? '計画' : '実績'}`);
    lines.push('');
    if (plan.comment) {
      lines.push(plan.comment);
      lines.push('');
    }

    let first = true;
    for (const role of rolesInPlan) {
      const logins = getSlotLogins(plan, role.id);
      if (!logins.some((l) => l)) continue;
      const rRoutines = routinesForRole(routines, role.id);
      if (!first) lines.push('');
      first = false;
      lines.push(`[${role.name}]`);
      for (const routine of rRoutines) {
        if (mode === 'plan') {
          const sum = logins.reduce((s, l) => s + getPlanLh(l, routine.id), 0);
          if (sum === 0) continue;
          lines.push(`${routine.name}: ${sum.toFixed(1)}LH`);
        } else {
          const actLhSum = logins.reduce((s, l) => s + getActLh(l, routine.id), 0);
          const jobSum = logins.reduce((s, l) => s + (getJob(l, routine.id) ?? 0), 0);
          if (actLhSum === 0 && jobSum === 0) continue;
          lines.push(`${routine.name}: ${actLhSum.toFixed(1)}LH / ${jobSum}件`);
        }
      }
    }
    return lines.join('\n');
  };

  const copyAsImage = async () => {
    if (!captureRef.current) return;
    setStatus(null);
    try {
      const canvas = await html2canvas(captureRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setStatus({ kind: 'error', msg: '画像生成に失敗' });
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setStatus({ kind: 'ok', msg: '画像をコピーしました' });
          setTimeout(() => setStatus(null), 2000);
        } catch (e) {
          setStatus({ kind: 'error', msg: String(e) });
        }
      }, 'image/png');
    } catch (e) {
      setStatus({ kind: 'error', msg: String(e) });
    }
  };

  if (!routines) {
    return <p className="text-sm text-muted-foreground p-6">loading…</p>;
  }

  // --- 日付情報 (badge用) ---
  const dayShort = formatJaDay(date).slice(0, 3); // "Mon", "Tue" 等
  const [y, m, d] = date.split('-');

  return (
    <div className="flex flex-col">
      {/* ------ トップバー (sticky) ------ */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        {/* 日付ナビ (主張) */}
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* 日付バッジ (強調表示) */}
        <div className="flex items-stretch overflow-hidden rounded-lg border-2 border-violet-400 shadow-md">
          <div className="flex flex-col items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 px-3 py-1 text-white">
            <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">
              {dayShort}
            </span>
            <span className="text-xs font-semibold leading-tight">{y}</span>
          </div>
          <div className="flex items-center bg-white px-4 py-1">
            <span className="font-mono text-2xl font-bold tracking-tight text-slate-800">
              {m}/{d}
            </span>
          </div>
        </div>

        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-36"
        />
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDate(todayISO())}>
          今日
        </Button>

        <span className="mx-2 h-8 w-px bg-slate-300" />

        {/* モード切り替え */}
        <div className="flex gap-1 rounded-lg border border-slate-300 bg-slate-50 p-0.5">
          <button
            onClick={() => setMode('plan')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'plan'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="h-4 w-4" />
            計画投稿用
          </button>
          <button
            onClick={() => setMode('actuals')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'actuals'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" />
            実績投稿用
          </button>
        </div>

        <span className="mx-2 h-8 w-px bg-slate-300" />

        {/* ズーム */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
            title="縮小"
            className="h-7 w-7 p-0"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[48px] text-center text-sm font-mono text-slate-700">
            {(zoom * 100).toFixed(0)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
            title="拡大"
            className="h-7 w-7 p-0"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom(0.7)}
            title="リセット"
            className="h-7 w-7 p-0"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {status && (
            <span
              className={`text-sm ${
                status.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {status.msg}
            </span>
          )}
          {dirtyLogins.size > 0 && (
            <span className="text-sm text-amber-600">未保存 {dirtyLogins.size}名</span>
          )}
          <Button size="sm" variant="outline" onClick={copyAsImage}>
            <Copy className="mr-1 h-4 w-4" />
            画像をコピー
          </Button>
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

      {/* ------ 大タイトル: 日付 + 配信種別 ------ */}
      <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {dayShort}
          </span>
          <span className="text-2xl font-bold text-slate-800">
            {y}/{m}/{d}
          </span>
        </div>
        <div
          className={`rounded-lg px-6 py-2 text-3xl font-bold shadow-sm ${
            mode === 'plan'
              ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-400'
              : 'bg-sky-100 text-sky-800 border-2 border-sky-400'
          }`}
        >
          {mode === 'plan' ? '計画' : '実績'}
        </div>
      </div>

      {/* ------ コンテンツ (ズーム可能エリア) ------ */}
      <div className="overflow-auto bg-slate-100" style={{ minHeight: '60vh' }}>
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: `${100 / zoom}%`,
          }}
        >
          <div ref={captureRef}>
            {mode === 'plan' ? (
              <PlanPostingView
                plan={plan}
                members={members}
                routines={routines}
                planSlots={planSlots}
                roles={roles}
                showForecastPanel={meta?.layout?.show_forecast_panel !== false}
              />
            ) : (
              <ActualsPostingView
                plan={plan}
                actuals={actuals}
                members={members}
                routines={routines}
                planSlots={planSlots}
                roles={roles}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
