import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Member } from './MembersTab';
import type { ShiftsFile } from './ShiftsTab';
import type { Role } from '@/lib/roles';
import { sortedRoles, getRoleColorPreset } from '@/lib/roles';

type Entries = Record<string, Record<string, boolean>>;

type Props = {
  members: Member[];
  initialShifts: ShiftsFile | null;
  roles?: Role[];
};

const ALL_VIEW = '__all__';
const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMonthGrid(month: string): Date[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const startPad = first.getDay();
  const days: Date[] = [];
  for (let i = 0; i < startPad; i++) {
    days.push(new Date(y, m - 1, 1 - (startPad - i)));
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(y, m - 1, i));
  }
  while (days.length < 42) {
    const next = new Date(days[days.length - 1]);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }
  return days;
}

function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 指定メンバー集合に対する dailyCounts / dailyMemberNames 計算
function calcDailyAgg(
  groupMembers: Member[],
  entries: Entries,
): { counts: Record<string, number>; names: Record<string, string[]> } {
  const counts: Record<string, number> = {};
  const names: Record<string, string[]> = {};
  for (const mem of groupMembers) {
    if (!mem.login) continue;
    const rec = entries[mem.login] ?? {};
    for (const [date, isWork] of Object.entries(rec)) {
      if (isWork) {
        counts[date] = (counts[date] ?? 0) + 1;
        if (!names[date]) names[date] = [];
        names[date].push(mem.name);
      }
    }
  }
  return { counts, names };
}

// Role別セクション (全員ビュー用)
function RoleHeatmapSection({
  title,
  roleColor,
  groupMembers,
  entries,
  monthGrid,
  month,
}: {
  title: React.ReactNode;
  roleColor: { bg: string; text: string; border: string; dot: string };
  groupMembers: Member[];
  entries: Entries;
  monthGrid: Date[];
  month: string;
}) {
  const { counts, names } = useMemo(
    () => calcDailyAgg(groupMembers, entries),
    [groupMembers, entries],
  );
  const maxMembers = groupMembers.length || 1;
  const totalWorkDays = Object.values(counts).reduce((s, v) => s + v, 0);

  return (
    <section className="mb-4">
      <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded border ${roleColor.bg} ${roleColor.border}`}>
        <span className={`inline-block w-2 h-2 rounded-full ${roleColor.dot}`} />
        <span className={`text-sm font-semibold ${roleColor.text}`}>{title}</span>
        <span className={`text-xs ${roleColor.text} opacity-70`}>
          {groupMembers.length}人 / のべ{totalWorkDays}人日
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_LABELS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[10px] font-medium py-0.5 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGrid.map((d) => {
          const iso = dateToISO(d);
          const isOtherMonth = d.getMonth() !== Number(month.split('-')[1]) - 1;
          const day = d.getDay();
          const isSun = day === 0;
          const isSat = day === 6;
          const count = counts[iso] ?? 0;
          const ratio = count / maxMembers;
          const bgAlpha = isOtherMonth ? 0 : Math.min(ratio, 1) * 0.85;
          const groupNames = names[iso] ?? [];
          const MAX_SHOW = 4;
          const shown = groupNames.slice(0, MAX_SHOW);
          const remain = groupNames.length - shown.length;
          return (
            <div
              key={iso}
              className={`h-16 rounded border flex flex-col p-1 ${
                isOtherMonth
                  ? 'bg-muted/30 text-muted-foreground/50 border-muted'
                  : 'border-input'
              }`}
              style={
                !isOtherMonth
                  ? { backgroundColor: `rgba(34, 197, 94, ${bgAlpha})` }
                  : undefined
              }
            >
              <div className="flex justify-between items-center text-[10px] shrink-0 leading-none">
                <span
                  className={`${
                    !isOtherMonth && isSun
                      ? 'text-red-500'
                      : !isOtherMonth && isSat
                        ? 'text-blue-500'
                        : ratio > 0.5
                          ? 'text-green-950 font-semibold'
                          : ''
                  }`}
                >
                  {d.getDate()}
                </span>
                {!isOtherMonth && (
                  <span className="font-mono text-muted-foreground">
                    {count}/{maxMembers}
                  </span>
                )}
              </div>
              {!isOtherMonth && groupNames.length > 0 && (
                <div className="flex-1 flex flex-wrap content-start justify-center gap-x-1 gap-y-0 text-[9px] leading-tight mt-0.5 overflow-hidden">
                  {shown.map((n) => (
                    <span key={n} className="whitespace-nowrap text-green-950">
                      {n}
                    </span>
                  ))}
                  {remain > 0 && <span className="text-muted-foreground">+{remain}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ShiftsViewTab({ members, initialShifts, roles }: Props) {
  const [month, setMonth] = useState<string>(initialShifts?.month ?? currentYM());
  const [entries, setEntries] = useState<Entries>(initialShifts?.entries ?? {});
  const [selectedLogin, setSelectedLogin] = useState<string>(ALL_VIEW);
  const [loading, setLoading] = useState(false);

  const reloadMonth = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const res = await window.api.readConfig(`shifts/shift_${ym}.json`);
      if (res.ok && res.data) {
        const d = res.data as ShiftsFile;
        setEntries(d.entries ?? {});
      } else {
        setEntries({});
      }
    } catch {
      setEntries({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialShifts && initialShifts.month === month) {
      setEntries(initialShifts.entries ?? {});
    } else {
      reloadMonth(month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const qcMembers = useMemo(
    () => (members ?? []).filter((m) => m.login && m.login.length > 0),
    [members],
  );

  // 個別ビューで使う統計
  const currentEntries = selectedLogin === ALL_VIEW ? {} : entries[selectedLogin] ?? {};
  const workDays = Object.values(currentEntries).filter(Boolean).length;
  const totalDays = Object.keys(currentEntries).length;

  const isAllView = selectedLogin === ALL_VIEW;
  const monthGrid = getMonthGrid(month);

  // Role別グルーピング (全員ビュー用)
  const sortedRoleList = useMemo(() => sortedRoles(roles ?? []), [roles]);
  const unassignedMembers = useMemo(() => {
    const roleIds = new Set(sortedRoleList.map((r) => r.id));
    return qcMembers.filter((m) => !m.role || !roleIds.has(m.role));
  }, [qcMembers, sortedRoleList]);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-sm px-3 py-1 bg-muted rounded w-28 text-center">
            {month}
          </span>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMonth(currentYM())}
            className="ml-1"
          >
            今月
          </Button>
        </div>

        <select
          value={selectedLogin}
          onChange={(e) => setSelectedLogin(e.target.value)}
          className="h-8 px-2 text-sm border rounded bg-background min-w-48"
        >
          <option value={ALL_VIEW}>全員 (Role別ヒートマップ)</option>
          <optgroup label="個別">
            {qcMembers.map((m) => (
              <option key={m.login} value={m.login}>
                {m.name} ({m.login})
              </option>
            ))}
          </optgroup>
        </select>

        <span className="text-xs text-muted-foreground">
          {isAllView
            ? `${qcMembers.length}名`
            : `出勤 ${workDays} / 登録 ${totalDays}日`}
        </span>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => reloadMonth(month)}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          再読込
        </Button>

        <span className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium">
          Read Only (編集は設定→Shifts)
        </span>
      </div>

      {isAllView ? (
        <div>
          {sortedRoleList.map((role) => {
            const roleMembers = qcMembers.filter((m) => m.role === role.id);
            if (roleMembers.length === 0) return null;
            const preset = getRoleColorPreset(role.color);
            return (
              <RoleHeatmapSection
                key={role.id}
                title={role.name}
                roleColor={preset}
                groupMembers={roleMembers}
                entries={entries}
                monthGrid={monthGrid}
                month={month}
              />
            );
          })}
          {unassignedMembers.length > 0 && (
            <RoleHeatmapSection
              title="未所属"
              roleColor={{
                bg: 'bg-slate-100',
                text: 'text-slate-700',
                border: 'border-slate-300',
                dot: 'bg-slate-400',
              }}
              groupMembers={unassignedMembers}
              entries={entries}
              monthGrid={monthGrid}
              month={month}
            />
          )}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map((w, i) => (
              <div
                key={w}
                className={`text-center text-xs font-medium py-1 ${
                  i === 0
                    ? 'text-red-500'
                    : i === 6
                      ? 'text-blue-500'
                      : 'text-muted-foreground'
                }`}
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((d) => {
              const iso = dateToISO(d);
              const isOtherMonth = d.getMonth() !== Number(month.split('-')[1]) - 1;
              const day = d.getDay();
              const isSun = day === 0;
              const isSat = day === 6;
              const isWork = currentEntries[iso] === true;
              return (
                <div
                  key={iso}
                  className={`h-20 rounded border text-sm flex flex-col items-center justify-center ${
                    isOtherMonth
                      ? 'bg-muted/30 text-muted-foreground/50 border-muted'
                      : isWork
                        ? 'bg-green-100 border-green-300 text-green-900 font-semibold'
                        : 'bg-background border-input text-muted-foreground'
                  }`}
                >
                  <span
                    className={`text-xs ${
                      !isOtherMonth && isSun
                        ? 'text-red-500'
                        : !isOtherMonth && isSat
                          ? 'text-blue-500'
                          : ''
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="text-[10px] mt-0.5">
                    {isOtherMonth ? '' : isWork ? '出勤' : '休'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
