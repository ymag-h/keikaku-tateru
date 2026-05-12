import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw, ChevronLeft, ChevronRight, Download, FolderOpen, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Member } from './MembersTab';
import type { Role } from '@/lib/roles';
import { sortedRoles, getRoleColorPreset } from '@/lib/roles';

type Entries = Record<string, Record<string, boolean>>;

export type ShiftsFile = {
  schema_version: string;
  month: string;
  imported_at?: string;
  updated_at?: string;
  entries: Entries;
};

type Props = {
  initial: ShiftsFile | null;
  members: Member[] | null;
  roles?: Role[];
  onSaved?: () => void;
};

const ALL_VIEW = '__all__';

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

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

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

// Role別ヒートマップセクション
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

export function ShiftsTab({ initial, members, roles, onSaved }: Props) {
  const [month, setMonth] = useState<string>(initial?.month ?? '2026-05');
  const [entries, setEntries] = useState<Entries>(initial?.entries ?? {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [selectedLogin, setSelectedLogin] = useState<string>(ALL_VIEW);

  const [sheetDialog, setSheetDialog] = useState<{
    open: boolean;
    filePath: string;
    sheets: string[];
    selectedSheet: string;
    sourceLabel: string;
  }>({ open: false, filePath: '', sheets: [], selectedSheet: '', sourceLabel: '' });

  useEffect(() => {
    if (!initial) return;
    setMonth(initial.month ?? '2026-05');
    setEntries(initial.entries ?? {});
    setDirty(false);
    setStatus(null);
  }, [initial]);

  const qcMembers = useMemo(
    () => (members ?? []).filter((m) => m.login && m.login.length > 0),
    [members],
  );

  const reloadMonth = useCallback(async (newMonth: string) => {
    try {
      const res = await window.api.readConfig(`shifts/shift_${newMonth}.json`);
      if (res.ok && res.data) {
        const d = res.data as ShiftsFile;
        setEntries(d.entries ?? {});
      } else {
        setEntries({});
      }
    } catch {
      setEntries({});
    }
  }, []);

  if (!initial) return <p className="text-sm text-muted-foreground">loading…</p>;

  const isAllView = selectedLogin === ALL_VIEW;
  const monthGrid = getMonthGrid(month);
  const currentEntries = isAllView ? {} : entries[selectedLogin] ?? {};

  // Role別グルーピング
  const sortedRoleList = sortedRoles(roles ?? []);
  const roleIdSet = new Set(sortedRoleList.map((r) => r.id));
  const unassignedMembers = qcMembers.filter((m) => !m.role || !roleIdSet.has(m.role));

  const toggleDay = (dateIso: string) => {
    if (isAllView) return;
    setEntries((prev) => {
      const cur = prev[selectedLogin] ?? {};
      return {
        ...prev,
        [selectedLogin]: { ...cur, [dateIso]: !cur[dateIso] },
      };
    });
    setDirty(true);
  };

  // 公休日以外を埋める
  const handleFillWorkdays = () => {
    const mem = (members ?? []).find((m) => m.login === selectedLogin);
    if (!mem) return;
    const offDays = mem.off_days ?? [];
    if (offDays.length === 0) {
      if (!confirm(`${mem.name} の公休曜日が未設定です。\n全日を出勤にしますか？`)) return;
    } else {
      const dayLabels = offDays.map((d) => WEEK_LABELS[d]).join('・');
      if (!confirm(`${mem.name} の ${month} を\n公休(${dayLabels})以外すべて出勤で上書きしますか？`)) return;
    }
    const [y, mo] = month.split('-').map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    const next: Record<string, boolean> = {};
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(y, mo - 1, d);
      const iso = dateToISO(date);
      next[iso] = !offDays.includes(date.getDay());
    }
    setEntries((prev) => ({ ...prev, [selectedLogin]: next }));
    setDirty(true);
  };

  const handlePrevMonth = () => {
    if (dirty && !confirm('未保存の変更があります。破棄して月を切り替えますか？')) return;
    const newMonth = shiftMonth(month, -1);
    setMonth(newMonth);
    setDirty(false);
    setStatus(null);
    reloadMonth(newMonth);
  };

  const handleNextMonth = () => {
    if (dirty && !confirm('未保存の変更があります。破棄して月を切り替えますか？')) return;
    const newMonth = shiftMonth(month, 1);
    setMonth(newMonth);
    setDirty(false);
    setStatus(null);
    reloadMonth(newMonth);
  };

  const handleReset = () => {
    setEntries(initial.entries ?? {});
    setDirty(false);
    setStatus(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload: ShiftsFile = {
        schema_version: '2.0.0',
        month,
        imported_at: initial.imported_at,
        updated_at: new Date().toISOString(),
        entries,
      };
      const res = await window.api.writeConfig(`shifts/shift_${month}.json`, payload);
      if (res.ok) {
        setDirty(false);
        setStatus({ kind: 'ok', msg: `保存しました: ${res.path ?? ''}` });
        onSaved?.();
      } else {
        setStatus({ kind: 'error', msg: res.error ?? '保存失敗' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const openSheetDialog = (
    filePath: string,
    sheets: string[],
    sourceLabel: string,
  ) => {
    const preferred = sheets.includes('シフト') ? 'シフト' : sheets[0] ?? '';
    setSheetDialog({
      open: true,
      filePath,
      sheets,
      selectedSheet: preferred,
      sourceLabel,
    });
  };

  const handleImport = async () => {
    if (dirty && !confirm('未保存の変更があります。破棄してNW共有から読み込みますか？')) return;
    setImporting(true);
    setStatus(null);
    try {
      const res = await window.api.listShiftSheetsFromNW(month);
      if (res.ok && res.sheets && res.filePath) {
        openSheetDialog(res.filePath, res.sheets, `NW: ${res.filePath}`);
      } else {
        setStatus({ kind: 'error', msg: res.error ?? 'シート一覧取得失敗' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const handleImportFromFile = async () => {
    if (dirty && !confirm('未保存の変更があります。破棄して選択ファイルから読み込みますか？')) return;
    setImporting(true);
    setStatus(null);
    try {
      const res = await window.api.listShiftSheetsFromFile();
      if (res.ok && res.sheets && res.filePath) {
        openSheetDialog(res.filePath, res.sheets, res.filePath);
      } else {
        setStatus({ kind: 'error', msg: res.error ?? 'シート一覧取得失敗' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmSheet = async () => {
    const { filePath, selectedSheet } = sheetDialog;
    if (!filePath || !selectedSheet) return;
    setImporting(true);
    setStatus(null);
    try {
      const res = await window.api.parseShiftSheet(filePath, selectedSheet);
      if (res.ok && res.entries) {
        setEntries(res.entries);
        setDirty(true);
        const unresolvedMsg =
          res.unresolved && res.unresolved.length > 0
            ? ` / 未解決: ${res.unresolved.slice(0, 3).join(', ')}${res.unresolved.length > 3 ? '…' : ''}`
            : '';
        setStatus({
          kind: 'ok',
          msg: `読込完了: ${Object.keys(res.entries).length}名 (シート: ${selectedSheet})${unresolvedMsg}`,
        });
        setSheetDialog((d) => ({ ...d, open: false }));
      } else {
        setStatus({ kind: 'error', msg: res.error ?? '読込失敗' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: String(e) });
    } finally {
      setImporting(false);
    }
  };

  // 統計 (個別)
  const workDays = Object.values(currentEntries).filter(Boolean).length;
  const totalDays = Object.keys(currentEntries).length;

  return (
    <>
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={handlePrevMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-sm px-3 py-1 bg-muted rounded w-28 text-center">
            {month}
          </span>
          <Button size="icon" variant="outline" onClick={handleNextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
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

        {/* 公休日以外を埋める (個別ビューのみ) */}
        {!isAllView && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleFillWorkdays}
            disabled={saving}
            className="gap-1"
            title="メンバーの公休曜日以外を出勤で上書き"
          >
            <CalendarCheck className="h-4 w-4" />
            公休以外を埋める
          </Button>
        )}

        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          onClick={handleImport}
          disabled={importing || saving}
          className="gap-1"
          title="NW共有 \\ant\\dept-as\\NRT5\\Operations\\ICQA\\11_Shift\\ から読み込み"
        >
          <Download className="h-4 w-4" />
          {importing ? '読込中…' : 'NWから読込'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleImportFromFile}
          disabled={importing || saving}
          className="gap-1"
          title="ローカルの xlsx ファイルを選択して読み込み"
        >
          <FolderOpen className="h-4 w-4" />
          ファイルから
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={!dirty || saving}
          className="gap-1"
        >
          <RotateCcw className="h-4 w-4" />
          リセット
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="gap-1"
        >
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      {(dirty || status) && (
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-900 font-medium">
              未保存の変更
            </span>
          )}
          {status && (
            <span
              className={`text-xs px-2 py-1 rounded font-medium ${
                status.kind === 'ok'
                  ? 'bg-green-100 text-green-900'
                  : 'bg-red-100 text-red-900'
              }`}
            >
              {status.msg}
            </span>
          )}
        </div>
      )}

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
          <p className="text-xs text-muted-foreground mt-2">
            個別編集は上のドロップダウンからメンバーを選択してください
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map((w, i) => (
              <div
                key={w}
                className={`text-center text-xs font-medium py-1 ${
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
              const isWork = currentEntries[iso] === true;
              return (
                <button
                  key={iso}
                  onClick={() => !isOtherMonth && toggleDay(iso)}
                  disabled={isOtherMonth}
                  className={`h-20 rounded border text-sm flex flex-col items-center justify-center transition-colors ${
                    isOtherMonth
                      ? 'bg-muted/30 text-muted-foreground/50 cursor-default border-muted'
                      : isWork
                      ? 'bg-green-100 hover:bg-green-200 border-green-300 text-green-900 font-semibold'
                      : 'bg-background hover:bg-muted border-input text-muted-foreground'
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
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>

    <Dialog open={sheetDialog.open} onOpenChange={(o) => setSheetDialog((d) => ({ ...d, open: o }))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>シートを選択</DialogTitle>
          <DialogDescription className="text-xs break-all">
            {sheetDialog.sourceLabel}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <select
            value={sheetDialog.selectedSheet}
            onChange={(e) =>
              setSheetDialog((d) => ({ ...d, selectedSheet: e.target.value }))
            }
            className="w-full h-9 px-2 text-sm border rounded bg-background"
          >
            {sheetDialog.sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-muted-foreground">
            シフト情報が書かれているシート名を選択してください。
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setSheetDialog((d) => ({ ...d, open: false }))}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleConfirmSheet}
            disabled={!sheetDialog.selectedSheet || importing}
          >
            {importing ? '読込中…' : '読み込む'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
