import { Plus, Trash2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from '@/components/MembersTab';
import type { DailyRoutine } from '@/components/RoutinesTab';
import type { CustomRoutine } from '@/lib/planUtils';
import type { RolePanelClasses } from '@/lib/roles';
import { NumberInput } from './NumberInput';

type Props = {
  roleClasses: RolePanelClasses;
  slotIndex: number;
  login: string | null;
  candidates: Member[];          // 選択肢 (役割でフィルタ済み)
  routines: DailyRoutine[];      // role applicable な daily routines
  assignments: Record<string, number>; // この人の assignments
  customRoutines: CustomRoutine[];     // この人の custom
  dailyHours: number;            // 計画容量 (時間)
  onSelectLogin: (login: string | null) => void;
  onUpdateAssignment: (routineId: string, lh: number) => void;
  onAddCustomRoutine: () => void;
  onUpdateCustomRoutine: (customId: string, patch: Partial<CustomRoutine>) => void;
  onDeleteCustomRoutine: (customId: string) => void;
};

export function PersonColumn({
  roleClasses,
  login,
  candidates,
  routines,
  assignments,
  customRoutines,
  dailyHours,
  onSelectLogin,
  onUpdateAssignment,
  onAddCustomRoutine,
  onUpdateCustomRoutine,
  onDeleteCustomRoutine,
}: Props) {
  const totalLh =
    Object.values(assignments).reduce((s, v) => s + (v ?? 0), 0) +
    customRoutines.reduce((s, c) => s + (c.lh ?? 0), 0);

  const remaining = dailyHours - totalLh;
  const overCapacity = totalLh > dailyHours + 0.001;
  const remainingBadge = overCapacity
    ? 'bg-red-600'
    : remaining < 0.5
      ? 'bg-amber-500'
      : 'bg-emerald-600';

  return (
    <div className={`flex w-64 flex-shrink-0 flex-col rounded-lg border-2 ${roleClasses.columnBorder} bg-white shadow-sm`}>
      {/* ヘッダー: メンバー選択 */}
      <div className={`flex items-center gap-2 rounded-t-md px-2 py-2 ${roleClasses.columnHeadBg} ${roleClasses.columnHeadText}`}>
        <select
          value={login ?? ''}
          onChange={(e) => onSelectLogin(e.target.value || null)}
          className="flex-1 rounded border border-white/60 bg-white px-2 py-1 text-sm font-medium text-slate-800 outline-none focus:border-slate-500"
        >
          <option value="">— 未割当 —</option>
          {candidates.map((c) => (
            <option key={c.login} value={c.login}>
              {c.name} ({c.login})
            </option>
          ))}
        </select>
        {login && (
          <button
            type="button"
            onClick={() => onSelectLogin(null)}
            title="クリア"
            className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
          >
            <UserX className="h-4 w-4" />
          </button>
        )}
      </div>

      {login ? (
        <div className="flex flex-col gap-0.5 p-2">
          {/* ヘッダー行: Task名 / Plan LH */}
          <div className="mb-1 flex items-center gap-1 border-b-2 border-slate-300 px-1 pb-1 text-[11px] font-bold text-slate-600">
            <span className="flex-1">Task名</span>
            <span className="w-16 text-center">Plan LH</span>
          </div>
          {/* daily routines */}
          <div className="space-y-0.5">
            {routines.map((r) => {
              const v = assignments[r.id] ?? 0;
              return (
                <div key={r.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-50">
                  <span className="flex-1 truncate text-xs text-slate-700" title={r.name}>
                    {r.name}
                  </span>
                  <NumberInput
                    value={v}
                    defaultValue={r.default_lh}
                    onChange={(nv) => onUpdateAssignment(r.id, nv ?? 0)}
                    highlight
                    className="w-16"
                  />
                </div>
              );
            })}
          </div>

          {/* custom routines 区切り */}
          {customRoutines.length > 0 && (
            <>
              <div className="my-1 flex items-center gap-1 text-[10px] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>臨時</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="space-y-0.5">
                {customRoutines.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50/50 px-1 py-0.5"
                  >
                    <Input
                      value={c.label}
                      onChange={(e) =>
                        onUpdateCustomRoutine(c.id, { label: e.target.value })
                      }
                      placeholder="作業名"
                      className="h-6 flex-1 border-amber-200 bg-white text-xs"
                    />
                    <NumberInput
                      value={c.lh ?? 0}
                      onChange={(nv) => onUpdateCustomRoutine(c.id, { lh: nv ?? 0 })}
                      highlight
                      className="w-14"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteCustomRoutine(c.id)}
                      title="削除"
                      className="rounded p-0.5 text-amber-600 hover:bg-amber-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 臨時追加ボタン */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddCustomRoutine}
            className="mt-1 h-6 w-full border-dashed border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
          >
            <Plus className="mr-1 h-3 w-3" />
            臨時ルーチン追加
          </Button>

          {/* 合計 / 残 */}
          <div className="mt-2 space-y-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Plan LH</span>
              <span className={`rounded px-2.5 py-1 font-mono text-base font-bold text-white shadow-sm ${roleClasses.badgeBg}`}>
                {totalLh.toFixed(2)} h
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">容量</span>
              <span className="rounded bg-slate-600 px-2.5 py-1 font-mono text-base font-semibold text-white shadow-sm">
                {dailyHours.toFixed(1)} h
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-300 pt-1.5">
              <span className="font-medium text-slate-700">残</span>
              <span className={`rounded px-2.5 py-1 font-mono text-base font-bold text-white shadow-sm ${remainingBadge}`}>
                {remaining.toFixed(2)} h
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center p-2 text-xs text-slate-400">
          メンバーを選択してください
        </div>
      )}
    </div>
  );
}
