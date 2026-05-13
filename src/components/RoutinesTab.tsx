import { useEffect, useMemo, useState } from 'react';
import {
  Trash2,
  Plus,
  Save,
  RotateCcw,
  Pencil,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/roles';
import { DEFAULT_ROLES, getRoleColorPreset, plannedRoles } from '@/lib/roles';

export type DailyRoutine = {
  id: string;
  name: string;
  default_lh: number;
  order: number;
  applicable_roles?: string[]; // Role ID 配列
  jobs_count?: boolean;
  hide_from_backlog?: boolean; // Backlog・配信用に非表示
};

export type WeeklyRoutine = {
  id: string;
  name: string;
  default_need: number;
  applicable_roles?: string[];
  // 実施曜日 (0=日, 6=土)。未設定なら任意の日に実施可
  day_of_week?: number[];
};

export type RoutinesFile = {
  schema_version?: string;
  imported_at?: string;
  daily: DailyRoutine[];
  weekly: WeeklyRoutine[];
  // Role ID ごとの専用カテゴリ (旧 sub は by_role.Sub へ自動 migrate)
  by_role?: Record<string, DailyRoutine[]>;
  design_target_hours_per_day?: number;
  updated_at?: string;
};

type Props = {
  initial: RoutinesFile | null;
  roles?: Role[];
  onSaved?: () => void;
};

// タブキー: 'daily' / 'weekly' / 'role:QC' / 'role:Sub' ...
type TabKey = string;

export function RoutinesTab({ initial, roles, onSaved }: Props) {
  const effectiveRoles = roles ?? DEFAULT_ROLES;
  const activeRoles = useMemo(() => plannedRoles(effectiveRoles), [effectiveRoles]);

  const [daily, setDaily] = useState<DailyRoutine[]>([]);
  const [weekly, setWeekly] = useState<WeeklyRoutine[]>([]);
  const [byRole, setByRole] = useState<Record<string, DailyRoutine[]>>({});
  const [tab, setTab] = useState<TabKey>('daily');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );

  // モーダル編集state
  // kind: 'daily' / 'weekly' / 'role:{roleId}'
  const [editMode, setEditMode] = useState<{
    kind: TabKey;
    idx: number;
  } | null>(null);

  useEffect(() => {
    setDaily(initial?.daily ?? []);
    setWeekly(initial?.weekly ?? []);
    // migration: initial.sub (旧) → by_role.Sub
    const br: Record<string, DailyRoutine[]> = { ...(initial?.by_role ?? {}) };
    const legacySub = (initial as unknown as { sub?: DailyRoutine[] })?.sub;
    if (legacySub && !br.Sub) {
      br.Sub = legacySub;
    }
    setByRole(br);
    setDirty(false);
    setStatus(null);
  }, [initial]);

  if (!initial) return <p className="text-sm text-muted-foreground">loading…</p>;

  // ---- daily ----
  const updateDaily = (idx: number, patch: Partial<DailyRoutine>) => {
    setDaily((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addDaily = () => {
    const nextOrder = Math.max(0, ...daily.map((d) => d.order ?? 0)) + 1;
    setDaily((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        name: '',
        default_lh: 0,
        order: nextOrder,
        applicable_roles: [activeRoles[0]?.id ?? 'QC'],
      },
    ]);
    setDirty(true);
  };
  const removeDaily = (idx: number) => {
    setDaily((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const moveDaily = (idx: number, delta: number) => {
    setDaily((prev) => {
      const next = [...prev];
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((r, i) => ({ ...r, order: i + 1 }));
    });
    setDirty(true);
  };

  // ---- byRole (Role別ルーチン) ----
  const updateByRole = (roleId: string, idx: number, patch: Partial<DailyRoutine>) => {
    setByRole((prev) => ({
      ...prev,
      [roleId]: (prev[roleId] ?? []).map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
    setDirty(true);
  };
  const addByRole = (roleId: string) => {
    setByRole((prev) => {
      const list = prev[roleId] ?? [];
      const nextOrder = Math.max(0, ...list.map((d) => d.order ?? 0)) + 1;
      return {
        ...prev,
        [roleId]: [
          ...list,
          {
            id: `${roleId.toLowerCase()}_${Date.now()}`,
            name: '',
            default_lh: 0,
            order: nextOrder,
            applicable_roles: [roleId],
          },
        ],
      };
    });
    setDirty(true);
  };
  const removeByRole = (roleId: string, idx: number) => {
    setByRole((prev) => ({
      ...prev,
      [roleId]: (prev[roleId] ?? []).filter((_, i) => i !== idx),
    }));
    setDirty(true);
  };
  const moveByRole = (roleId: string, idx: number, delta: number) => {
    setByRole((prev) => {
      const list = [...(prev[roleId] ?? [])];
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= list.length) return prev;
      [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
      return {
        ...prev,
        [roleId]: list.map((r, i) => ({ ...r, order: i + 1 })),
      };
    });
    setDirty(true);
  };

  // ---- weekly ----
  const updateWeekly = (idx: number, patch: Partial<WeeklyRoutine>) => {
    setWeekly((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addWeekly = () => {
    setWeekly((prev) => [
      ...prev,
      {
        id: `new_w_${Date.now()}`,
        name: '',
        default_need: 0,
        applicable_roles: [activeRoles[0]?.id ?? 'QC'],
        day_of_week: [],
      },
    ]);
    setDirty(true);
  };
  const removeWeekly = (idx: number) => {
    setWeekly((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const moveWeekly = (idx: number, delta: number) => {
    setWeekly((prev) => {
      const next = [...prev];
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    // byRole から、activeRoles に存在しない Role のものは維持 (削除予防)
    const data: RoutinesFile = {
      ...(initial ?? {}),
      schema_version: '1.3.0',
      daily,
      weekly,
      by_role: byRole,
      updated_at: new Date().toISOString(),
    };
    // 旧 sub フィールドを消去
    delete (data as unknown as { sub?: unknown }).sub;

    const r = await window.api.writeConfig('routines.json', data);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      setStatus({ kind: 'ok', msg: '保存しました' });
      onSaved?.();
    } else {
      setStatus({ kind: 'error', msg: r.error ?? 'unknown error' });
    }
  };

  const reset = () => {
    setDaily(initial?.daily ?? []);
    setWeekly(initial?.weekly ?? []);
    const br: Record<string, DailyRoutine[]> = { ...(initial?.by_role ?? {}) };
    const legacySub = (initial as unknown as { sub?: DailyRoutine[] })?.sub;
    if (legacySub && !br.Sub) br.Sub = legacySub;
    setByRole(br);
    setDirty(false);
    setStatus(null);
  };

  // ---- 現在編集中の項目 ----
  const editingItem = useMemo(() => {
    if (!editMode) return null;
    if (editMode.kind === 'daily') return daily[editMode.idx];
    if (editMode.kind === 'weekly') return weekly[editMode.idx];
    if (editMode.kind.startsWith('role:')) {
      const roleId = editMode.kind.slice('role:'.length);
      return (byRole[roleId] ?? [])[editMode.idx];
    }
    return null;
  }, [editMode, daily, byRole, weekly]);

  const applyEdit = (patch: Partial<DailyRoutine & WeeklyRoutine>) => {
    if (!editMode) return;
    if (editMode.kind === 'daily') updateDaily(editMode.idx, patch);
    else if (editMode.kind === 'weekly')
      updateWeekly(editMode.idx, patch as Partial<WeeklyRoutine>);
    else if (editMode.kind.startsWith('role:')) {
      const roleId = editMode.kind.slice('role:'.length);
      updateByRole(roleId, editMode.idx, patch);
    }
  };

  // タブ構成: Daily, Weekly, then role tabs (plannedRoles のみ)
  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'daily', label: 'Daily', count: daily.length },
    { key: 'weekly', label: 'Weekly', count: weekly.length },
    ...activeRoles.map((r) => ({
      key: `role:${r.id}`,
      label: r.name,
      count: (byRole[r.id] ?? []).length,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* ---- 上部タブ ---- */}
      <div className="flex items-center gap-2 border-b border-slate-200 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'relative px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'text-slate-900 border-b-2 border-slate-900'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
            <span className="ml-1 text-xs font-mono text-slate-400">({t.count})</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {status && (
            <span
              className={`text-xs ${status.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}
            >
              {status.msg}
            </span>
          )}
          {dirty && (
            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-900 font-medium">
              未保存
            </span>
          )}
          <Button size="sm" variant="outline" onClick={reset} disabled={!dirty || saving}>
            <RotateCcw className="w-3 h-3 mr-1" /> 戻す
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            <Save className="w-3 h-3 mr-1" /> 保存
          </Button>
        </div>
      </div>

      {/* ---- Daily タブ ---- */}
      {tab === 'daily' && (
        <RoutineList
          title="Daily ルーチン"
          items={daily}
          roles={effectiveRoles}
          showRoleColumn
          onAdd={addDaily}
          onMove={moveDaily}
          onRemove={removeDaily}
          onEdit={(idx) => setEditMode({ kind: 'daily', idx })}
        />
      )}

      {/* ---- Weekly タブ ---- */}
      {tab === 'weekly' && (
        <WeeklyList
          items={weekly}
          roles={effectiveRoles}
          onAdd={addWeekly}
          onMove={moveWeekly}
          onRemove={removeWeekly}
          onEdit={(idx) => setEditMode({ kind: 'weekly', idx })}
        />
      )}

      {/* ---- Role別タブ ---- */}
      {activeRoles.map((r) => {
        const tabKey = `role:${r.id}`;
        if (tab !== tabKey) return null;
        const items = byRole[r.id] ?? [];
        return (
          <RoutineList
            key={r.id}
            title={`${r.name} 専用ルーチン`}
            items={items}
            roles={effectiveRoles}
            onAdd={() => addByRole(r.id)}
            onMove={(idx, d) => moveByRole(r.id, idx, d)}
            onRemove={(idx) => removeByRole(r.id, idx)}
            onEdit={(idx) => setEditMode({ kind: tabKey, idx })}
          />
        );
      })}

      {/* ---- 編集モーダル ---- */}
      {editMode && editingItem && (
        <EditModal
          kind={editMode.kind}
          item={editingItem}
          roles={effectiveRoles}
          onApply={applyEdit}
          onClose={() => setEditMode(null)}
        />
      )}
    </div>
  );
}

// =========================================================
// Daily / Role 共通リスト
// =========================================================
type RoutineListProps = {
  title: string;
  items: DailyRoutine[];
  roles: Role[];
  showRoleColumn?: boolean; // Daily のみ Role 列を出す
  onAdd: () => void;
  onMove: (idx: number, delta: number) => void;
  onRemove: (idx: number) => void;
  onEdit: (idx: number) => void;
};

function RoutineList({
  title,
  items,
  roles,
  showRoleColumn,
  onAdd,
  onMove,
  onRemove,
  onEdit,
}: RoutineListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {title} ({items.length})
        </h3>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="w-3 h-3 mr-1" /> 追加
        </Button>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1 px-1 w-20">順序</th>
            <th className="text-left py-1 px-1">名前</th>
            <th className="text-left py-1 px-1 w-40">id</th>
            <th className="text-right py-1 px-1 w-16">LH</th>
            <th className="text-center py-1 px-1 w-16" title="JPH表示対象">
              Jobs
            </th>
            {showRoleColumn && (
              <th className="text-center py-1 px-1 w-40">対応Role</th>
            )}
            <th className="text-right py-1 px-1 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => {
            const roleIds = r.applicable_roles ?? [];
            return (
              <tr key={i} className="border-b hover:bg-slate-50 group">
                <td className="py-1 px-1">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-slate-400 w-6 text-center">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onMove(i, -1)}
                      disabled={i === 0}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="上へ"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(i, 1)}
                      disabled={i === items.length - 1}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="下へ"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                <td className="py-1 px-1 text-slate-800 font-medium">
                  {r.name || <span className="italic text-slate-400">(無名)</span>}
                </td>
                <td className="py-1 px-1 font-mono text-slate-500 text-[10px]">
                  {r.id}
                </td>
                <td className="py-1 px-1 text-right font-mono">
                  {r.default_lh.toFixed(2)}
                </td>
                <td className="py-1 px-1 text-center">
                  {r.jobs_count ? (
                    <span className="text-emerald-600">✓</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                {showRoleColumn && (
                  <td className="py-1 px-1 text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      {roleIds.map((rid) => {
                        const role = roles.find((x) => x.id === rid);
                        if (!role) return null;
                        const preset = getRoleColorPreset(role.color);
                        return (
                          <span
                            key={rid}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium',
                              preset.bg,
                              preset.text,
                            )}
                          >
                            {role.name}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                )}
                <td className="py-1 px-1 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title="編集"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={showRoleColumn ? 7 : 6}
                className="py-6 text-center text-slate-400 text-xs"
              >
                ルーチンがありません。「追加」から作成してください。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// =========================================================
// Weekly リスト
// =========================================================
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

type WeeklyListProps = {
  items: WeeklyRoutine[];
  roles: Role[];
  onAdd: () => void;
  onMove: (idx: number, delta: number) => void;
  onRemove: (idx: number) => void;
  onEdit: (idx: number) => void;
};

function WeeklyList({
  items,
  roles,
  onAdd,
  onMove,
  onRemove,
  onEdit,
}: WeeklyListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Weekly ルーチン ({items.length})</h3>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="w-3 h-3 mr-1" /> 追加
        </Button>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1 px-1 w-20">順序</th>
            <th className="text-left py-1 px-1">名前</th>
            <th className="text-left py-1 px-1 w-40">id</th>
            <th className="text-right py-1 px-1 w-16">必要LH</th>
            <th className="text-center py-1 px-1 w-40">対応Role</th>
            <th className="text-center py-1 px-1 w-36">曜日</th>
            <th className="text-right py-1 px-1 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((w, i) => {
            const roleIds = w.applicable_roles ?? [];
            const days = w.day_of_week ?? [];
            return (
              <tr key={i} className="border-b hover:bg-slate-50">
                <td className="py-1 px-1">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-slate-400 w-6 text-center">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onMove(i, -1)}
                      disabled={i === 0}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(i, 1)}
                      disabled={i === items.length - 1}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                <td className="py-1 px-1 text-slate-800 font-medium">
                  {w.name || <span className="italic text-slate-400">(無名)</span>}
                </td>
                <td className="py-1 px-1 font-mono text-slate-500 text-[10px]">
                  {w.id}
                </td>
                <td className="py-1 px-1 text-right font-mono">
                  {w.default_need.toFixed(2)}
                </td>
                <td className="py-1 px-1 text-center">
                  <div className="flex gap-1 justify-center flex-wrap">
                    {roleIds.map((rid) => {
                      const role = roles.find((x) => x.id === rid);
                      if (!role) return null;
                      const preset = getRoleColorPreset(role.color);
                      return (
                        <span
                          key={rid}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            preset.bg,
                            preset.text,
                          )}
                        >
                          {role.name}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="py-1 px-1 text-center">
                  {days.length === 0 ? (
                    <span className="text-slate-400 text-[10px]">任意</span>
                  ) : (
                    <span className="font-mono text-[11px] text-slate-700">
                      {days
                        .slice()
                        .sort()
                        .map((d) => WEEKDAY_LABELS[d])
                        .join('・')}
                    </span>
                  )}
                </td>
                <td className="py-1 px-1 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    title="編集"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-slate-400 text-xs">
                Weekly ルーチンがありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// =========================================================
// 編集モーダル
// =========================================================
type EditModalProps = {
  kind: TabKey;
  item: DailyRoutine | WeeklyRoutine;
  roles: Role[];
  onApply: (patch: Partial<DailyRoutine & WeeklyRoutine>) => void;
  onClose: () => void;
};

function EditModal({ kind, item, roles, onApply, onClose }: EditModalProps) {
  const isWeekly = kind === 'weekly';
  const isRoleSpecific = kind.startsWith('role:');
  const roleIdFixed = isRoleSpecific ? kind.slice('role:'.length) : null;
  const it = item as DailyRoutine & WeeklyRoutine;
  const currentRoles = it.applicable_roles ?? (roleIdFixed ? [roleIdFixed] : ['QC']);

  const toggleRole = (roleId: string) => {
    const next = currentRoles.includes(roleId)
      ? currentRoles.filter((x) => x !== roleId)
      : [...currentRoles, roleId];
    onApply({ applicable_roles: next.length > 0 ? next : [roles[0]?.id ?? 'QC'] });
  };

  const toggleDay = (d: number) => {
    const days = it.day_of_week ?? [];
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    onApply({ day_of_week: next.sort() });
  };

  const title =
    kind === 'daily'
      ? 'Daily ルーチン編集'
      : kind === 'weekly'
        ? 'Weekly ルーチン編集'
        : `${roles.find((r) => r.id === roleIdFixed)?.name ?? roleIdFixed} 専用ルーチン編集`;

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 名前 */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">名前</label>
            <Input
              value={it.name}
              onChange={(e) => onApply({ name: e.target.value })}
              placeholder="Andon"
              className="h-9"
            />
          </div>

          {/* id */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              id <span className="text-xs text-slate-400">(変更注意: データ連携キー)</span>
            </label>
            <Input
              value={it.id}
              onChange={(e) => onApply({ id: e.target.value })}
              className="h-9 font-mono text-xs"
            />
          </div>

          {/* default LH / default need */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {isWeekly ? '必要 LH' : 'default LH'}
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={isWeekly ? it.default_need : it.default_lh}
              onChange={(e) =>
                onApply(
                  isWeekly
                    ? { default_need: Number(e.target.value) }
                    : { default_lh: Number(e.target.value) },
                )
              }
              className="h-9 font-mono"
            />
          </div>

          {/* 対応Role (Role 専用カテゴリは固定なので非表示) */}
          {!isRoleSpecific && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">対応 Role</label>
              <div className="flex gap-3 flex-wrap">
                {roles.map((r) => {
                  const preset = getRoleColorPreset(r.color);
                  const active = currentRoles.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={cn(
                        'flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded border',
                        active
                          ? `${preset.bg} ${preset.text} ${preset.border}`
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleRole(r.id)}
                        className="h-4 w-4"
                      />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Jobs count (daily / role-specific のみ) */}
          {!isWeekly && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={it.jobs_count ?? false}
                  onChange={(e) => onApply({ jobs_count: e.target.checked, ...(!e.target.checked ? { hide_from_backlog: false } : {}) })}
                  className="h-4 w-4"
                />
                <span className="font-medium text-slate-700">Jobs カウント対象</span>
                <span className="text-xs text-slate-400">
                  (目標JPH / Job数入力欄が出ます)
                </span>
              </label>
              {(it.jobs_count ?? false) && (
                <label className="flex items-center gap-2 text-sm cursor-pointer ml-6">
                  <input
                    type="checkbox"
                    checked={it.hide_from_backlog ?? false}
                    onChange={(e) => onApply({ hide_from_backlog: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-slate-600">配信用・Backlog に表示しない</span>
                  <span className="text-xs text-slate-400">
                    (ダッシュボードのJob Count推移には引き続き表示)
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Weekly 曜日設定 */}
          {isWeekly && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                実施曜日
                <span className="ml-2 text-xs text-slate-400">
                  (選択した曜日の計画にデフォルトで組み込まれます / 未選択=任意)
                </span>
              </label>
              <div className="flex gap-2">
                {WEEKDAY_LABELS.map((label, d) => {
                  const active = (it.day_of_week ?? []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={cn(
                        'w-10 h-10 rounded font-medium text-sm transition-colors',
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        d === 0 && !active && 'text-red-500',
                        d === 6 && !active && 'text-blue-500',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
