import { useEffect, useMemo, useState } from 'react';
import {
  Save,
  RotateCcw,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Tag as TagIcon,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  Role,
  RoleColor,
  RolesFile,
} from '@/lib/roles';
import {
  DEFAULT_ROLES,
  ROLE_COLOR_PRESETS,
  getRoleColorPreset,
  isValidRoleId,
} from '@/lib/roles';
import type { Member } from '../MembersTab';

type Props = {
  initial: RolesFile | null;
  members: Member[];
  onSaved?: () => void;
};

export function RolesPane({ initial, members, onSaved }: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    setRoles([...(initial?.roles ?? DEFAULT_ROLES)].sort((a, b) => a.order - b.order));
    setDirty(false);
    setStatus(null);
  }, [initial]);

  // 使用中 Role の検出 (Members で使われているか)
  const usedRoleIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of members) {
      if (m.role) s.add(m.role);
    }
    return s;
  }, [members]);

  const update = (idx: number, patch: Partial<Role>) => {
    setRoles((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const add = () => {
    const newId = `role_${Date.now()}`;
    const usedColors = new Set(roles.map((r) => r.color));
    const availableColor =
      ROLE_COLOR_PRESETS.find((p) => !usedColors.has(p.id))?.id ?? 'slate';
    setRoles((prev) => [
      ...prev,
      {
        id: newId,
        name: '新しい Role',
        color: availableColor,
        show_in_plan: false,
        order: prev.length > 0 ? Math.max(...prev.map((r) => r.order)) + 1 : 0,
      },
    ]);
    setDirty(true);
  };

  const remove = (idx: number) => {
    const target = roles[idx];
    if (usedRoleIds.has(target.id)) {
      setStatus({
        kind: 'error',
        msg: `"${target.name}" は使用中のため削除できません (Members で ${
          [...usedRoleIds].filter((x) => x === target.id).length
        }件使用)`,
      });
      return;
    }
    setRoles((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const move = (idx: number, delta: number) => {
    setRoles((prev) => {
      const next = [...prev];
      const ni = idx + delta;
      if (ni < 0 || ni >= next.length) return prev;
      [next[idx], next[ni]] = [next[ni], next[idx]];
      return next.map((r, i) => ({ ...r, order: i }));
    });
    setDirty(true);
  };

  const validate = (): string | null => {
    const ids = new Set<string>();
    for (const r of roles) {
      if (!isValidRoleId(r.id)) {
        return `Role ID "${r.id}" は不正 (英字で始まる英数字+アンダーバーのみ)`;
      }
      if (ids.has(r.id)) {
        return `Role ID "${r.id}" が重複`;
      }
      if (!r.name.trim()) {
        return `Role "${r.id}" の名前が空`;
      }
      ids.add(r.id);
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setStatus({ kind: 'error', msg: err });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const payload: RolesFile = {
        schema_version: '1.0.0',
        roles: roles.map((r, i) => ({ ...r, order: i })),
      };
      const r = await window.api.writeConfig('roles.json', payload);
      if (r.ok) {
        setDirty(false);
        setStatus({ kind: 'ok', msg: '保存しました' });
        onSaved?.();
        setTimeout(() => setStatus(null), 2500);
      } else {
        setStatus({ kind: 'error', msg: r.error ?? '保存失敗' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRoles([...(initial?.roles ?? DEFAULT_ROLES)].sort((a, b) => a.order - b.order));
    setDirty(false);
    setStatus(null);
  };

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <TagIcon className="h-5 w-5 text-slate-700" />
        <h3 className="text-sm font-semibold text-slate-900">Roles</h3>
        <p className="text-xs text-slate-500 flex-1">
          Member / Routine に紐付けるロール種別。色と「計画マスタに表示」を編集できます。
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={add} className="gap-1">
          <Plus className="h-4 w-4" /> 追加
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={!dirty || saving}
          className="gap-1"
        >
          <RotateCcw className="h-4 w-4" />
          戻す
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
        {dirty && (
          <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-900 font-medium">
            未保存の変更
          </span>
        )}
        {status && (
          <span
            className={cn(
              'text-xs px-2 py-1 rounded font-medium',
              status.kind === 'ok'
                ? 'bg-green-100 text-green-900'
                : 'bg-red-100 text-red-900',
            )}
          >
            {status.msg}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b">
            <tr>
              <th className="py-2 px-1 font-medium w-20">順序</th>
              <th className="py-2 px-1 font-medium w-32">id</th>
              <th className="py-2 px-1 font-medium">名前</th>
              <th className="py-2 px-1 font-medium w-48">色</th>
              <th className="py-2 px-1 font-medium w-32 text-center">
                計画マスタ表示
              </th>
              <th className="py-2 px-1 font-medium w-16 text-center">使用</th>
              <th className="py-2 px-1 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => {
              const preset = getRoleColorPreset(r.color);
              const inUse = usedRoleIds.has(r.id);
              return (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-1 px-1">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-slate-400 w-6 text-center">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        title="上へ"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === roles.length - 1}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        title="下へ"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="py-1 px-1">
                    <Input
                      value={r.id}
                      onChange={(e) => update(i, { id: e.target.value })}
                      disabled={inUse}
                      className={cn(
                        'h-8 text-xs font-mono',
                        inUse && 'bg-slate-50 text-slate-400',
                      )}
                      title={inUse ? '使用中のため変更不可' : undefined}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <Input
                      value={r.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {ROLE_COLOR_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            update(i, { color: p.id as RoleColor })
                          }
                          className={cn(
                            'w-6 h-6 rounded transition-all',
                            p.dot,
                            r.color === p.id
                              ? 'ring-2 ring-slate-900 ring-offset-1'
                              : 'opacity-60 hover:opacity-100',
                          )}
                          title={p.label}
                        />
                      ))}
                      <span
                        className={cn(
                          'ml-2 px-2 py-0.5 rounded text-xs font-medium',
                          preset.bg,
                          preset.text,
                        )}
                      >
                        {r.name || r.id}
                      </span>
                    </div>
                  </td>
                  <td className="py-1 px-1 text-center">
                    <button
                      type="button"
                      onClick={() => update(i, { show_in_plan: !r.show_in_plan })}
                      className={cn(
                        'flex items-center gap-1 mx-auto px-2 py-1 rounded text-xs transition-colors',
                        r.show_in_plan
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {r.show_in_plan ? (
                        <>
                          <Eye className="w-3 h-3" /> 表示
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" /> 非表示
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-1 px-1 text-center">
                    {inUse ? (
                      <span
                        className="inline-flex items-center justify-center text-amber-600"
                        title="使用中"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-1 px-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(i)}
                      disabled={inUse}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-red-100 disabled:opacity-30"
                      title={inUse ? '使用中のため削除不可' : '削除'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground py-6 text-sm">
                  Role がありません。「追加」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        ※ 計画マスタ表示=ON の Role は「計画マスタ」タブに担当枠セクションが表示されます。
        枠数は「General」設定で調整できます。
      </p>
    </div>
  );
}
