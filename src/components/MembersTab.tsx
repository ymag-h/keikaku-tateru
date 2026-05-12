import { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Save, RotateCcw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/roles';
import { DEFAULT_ROLES, getRoleColorPreset, sortedRoles } from '@/lib/roles';

// 互換: 既存コードが MembersTab から Role/PlanSlots を import しているため、
// 型は planUtils に移したものを再 export する
export type { PlanSlots } from '@/lib/planUtils';

export type Member = {
  login: string;
  name: string;
  role?: string; // Role ID (任意)
  daily_hours?: number;
  off_days?: number[]; // 公休曜日 (0=日, 1=月, ... 6=土)
  uph?: Record<string, number | null>;
};

export type MembersFile = {
  schema_version?: string;
  fc?: string;
  imported_at?: string;
  updated_at?: string;
  // 旧スキーマ互換: plan_slots はもう編集 UI なし (app_meta.default_slots に移行)
  // 既存値は保持して save 時も書き戻す
  plan_slots?: Record<string, number>;
  members: Member[];
};

type Props = {
  initial: MembersFile | null;
  roles?: Role[];
  onSaved?: () => void;
};

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 旧 role 'Special' / 'QC(旧)' を 'Sub' / 'QC' に自動マイグレート
// Roles 配列に存在しない場合は先頭 Role に fallback
function migrateMember(m: Member, roles: Role[]): Member {
  let role = m.role;
  if ((role as string) === 'Special') role = 'Sub';
  if (role && !roles.some((r) => r.id === role)) {
    role = roles[0]?.id ?? 'QC';
  }
  if (!role) role = roles[0]?.id ?? 'QC';
  return { ...m, role, off_days: m.off_days ?? [] };
}

export function MembersTab({ initial, roles, onSaved }: Props) {
  const effectiveRoles = roles ?? DEFAULT_ROLES;
  const sortedRls = useMemo(() => sortedRoles(effectiveRoles), [effectiveRoles]);

  const [members, setMembers] = useState<Member[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );
  const [editIdx, setEditIdx] = useState<number | null>(null);

  useEffect(() => {
    setMembers((initial?.members ?? []).map((m) => migrateMember(m, effectiveRoles)));
    setDirty(false);
    setStatus(null);
  }, [initial, effectiveRoles]);

  if (!initial) return <p className="text-sm text-muted-foreground">loading…</p>;

  const update = (idx: number, patch: Partial<Member>) => {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
    setDirty(true);
  };

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      {
        login: '',
        name: '',
        role: sortedRls[0]?.id ?? 'QC',
        daily_hours: 7.0,
        off_days: [],
        uph: { andon: 0, sim: 0, lost: 0 },
      },
    ]);
    setDirty(true);
    setEditIdx(members.length);
  };

  const deleteMember = (idx: number) => {
    if (!confirm(`メンバー「${members[idx]?.name || '(無名)'}」を削除しますか?`)) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleReset = () => {
    setMembers((initial.members ?? []).map((m) => migrateMember(m, effectiveRoles)));
    setDirty(false);
    setStatus(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload: MembersFile = {
        ...initial,
        schema_version: '1.4.0',
        plan_slots: initial.plan_slots,
        members,
      };
      const res = await window.api.writeMembersFile(payload);
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

  const editingMember = useMemo(
    () => (editIdx !== null ? members[editIdx] ?? null : null),
    [editIdx, members],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={addMember} className="gap-1">
          <Plus className="h-4 w-4" />
          追加
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
        <span className="ml-auto text-[10px] text-muted-foreground">
          ※ 編集は鉛筆マークから。計画担当枠数は「General」で設定
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b">
            <tr>
              <th className="py-2 px-2 font-medium">login</th>
              <th className="py-2 px-2 font-medium">name</th>
              <th className="py-2 px-2 font-medium">role</th>
              <th className="py-2 px-2 font-medium text-right" title="1日の勤務時間">H/day</th>
              <th className="py-2 px-2 font-medium">公休</th>
              <th className="py-2 px-2 font-medium text-right">UPH andon</th>
              <th className="py-2 px-2 font-medium text-right">UPH sim</th>
              <th className="py-2 px-2 font-medium text-right">UPH lost</th>
              <th className="py-2 px-1 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const memberRole = effectiveRoles.find((r) => r.id === m.role);
              const preset = memberRole
                ? getRoleColorPreset(memberRole.color)
                : getRoleColorPreset('slate');
              const offDays = m.off_days ?? [];
              return (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50 group">
                  <td className="py-2 px-2 font-mono text-xs">
                    {m.login || <span className="text-muted-foreground">(未設定)</span>}
                  </td>
                  <td className="py-2 px-2 text-sm">
                    {m.name || <span className="text-muted-foreground">(無名)</span>}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium inline-block',
                        preset.bg,
                        preset.text,
                      )}
                    >
                      {memberRole?.name ?? m.role ?? '-'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">
                    {(m.daily_hours ?? 7.0).toFixed(1)}
                  </td>
                  <td className="py-2 px-2">
                    {offDays.length === 0 ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-700">
                        {offDays
                          .slice()
                          .sort((a, b) => a - b)
                          .map((d) => WEEK_LABELS[d])
                          .join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">
                    {m.uph?.andon ?? '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">
                    {m.uph?.sim ?? '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">
                    {m.uph?.lost ?? '-'}
                  </td>
                  <td className="py-1 px-1">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditIdx(i)}
                        className="h-7 w-7 text-muted-foreground hover:bg-slate-100 hover:text-slate-800"
                        title="編集"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMember(i)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-red-100"
                        title="削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted-foreground py-4 text-sm">
                  メンバーがいません。「追加」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- 個別編集モーダル ---- */}
      {editingMember && editIdx !== null && (
        <MemberEditModal
          member={editingMember}
          roles={sortedRls}
          onApply={(patch) => update(editIdx, patch)}
          onClose={() => setEditIdx(null)}
        />
      )}
    </div>
  );
}

// =========================================================
// 個別メンバー編集モーダル
// =========================================================
type EditProps = {
  member: Member;
  roles: Role[];
  onApply: (patch: Partial<Member>) => void;
  onClose: () => void;
};

function MemberEditModal({ member, roles, onApply, onClose }: EditProps) {
  const offDays = member.off_days ?? [];
  const toggleOffDay = (d: number) => {
    const next = offDays.includes(d)
      ? offDays.filter((x) => x !== d)
      : [...offDays, d].sort((a, b) => a - b);
    onApply({ off_days: next });
  };

  const updateUph = (key: string, val: number) => {
    onApply({ uph: { ...(member.uph ?? {}), [key]: val } });
  };

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            メンバー編集:{' '}
            <span className="font-mono text-base text-slate-600">
              {member.name || '(無名)'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">login</label>
              <Input
                value={member.login}
                onChange={(e) => onApply({ login: e.target.value })}
                className="font-mono"
                placeholder="amazon login"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">name</label>
              <Input
                value={member.name}
                onChange={(e) => onApply({ name: e.target.value })}
                placeholder="氏名"
              />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Role</label>
            <div className="flex gap-2 flex-wrap">
              {roles.map((r) => {
                const preset = getRoleColorPreset(r.color);
                const active = (member.role ?? roles[0]?.id) === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onApply({ role: r.id })}
                    className={cn(
                      'flex-1 min-w-20 py-2 px-3 rounded text-sm font-medium transition-colors border',
                      active
                        ? `${preset.bg} ${preset.text} ${preset.border} shadow-sm`
                        : 'bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200',
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              ※ Roles 設定で新しい Role を追加できます
            </p>
          </div>

          {/* daily_hours */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              daily_hours <span className="text-xs text-slate-400">(1日の勤務時間)</span>
            </label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="24"
              value={member.daily_hours ?? 7.0}
              onChange={(e) => onApply({ daily_hours: Number(e.target.value) })}
              className="font-mono"
            />
          </div>

          {/* 公休曜日 */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              公休曜日 <span className="text-xs text-slate-400">(シフトの「公休日以外を埋める」で使用)</span>
            </label>
            <div className="flex gap-1">
              {WEEK_LABELS.map((lbl, d) => {
                const active = offDays.includes(d);
                const isSun = d === 0;
                const isSat = d === 6;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleOffDay(d)}
                    className={cn(
                      'flex-1 py-2 rounded text-sm font-medium transition-colors border',
                      active
                        ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                        : cn(
                            'bg-white hover:bg-slate-100 border-slate-300',
                            isSun
                              ? 'text-red-500'
                              : isSat
                                ? 'text-blue-500'
                                : 'text-slate-600',
                          ),
                    )}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              {offDays.length === 0
                ? '未設定 (全曜日出勤可)'
                : `毎週 ${offDays
                    .slice()
                    .sort((a, b) => a - b)
                    .map((d) => WEEK_LABELS[d])
                    .join('・')} 休み`}
            </p>
          </div>

          {/* UPH */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              UPH <span className="text-xs text-slate-400">(1時間あたり処理件数、実績平均)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-xs text-slate-500">andon</span>
                <Input
                  type="number"
                  step="0.1"
                  value={member.uph?.andon ?? 0}
                  onChange={(e) => updateUph('andon', Number(e.target.value))}
                  className="font-mono"
                />
              </div>
              <div>
                <span className="text-xs text-slate-500">sim</span>
                <Input
                  type="number"
                  step="0.1"
                  value={member.uph?.sim ?? 0}
                  onChange={(e) => updateUph('sim', Number(e.target.value))}
                  className="font-mono"
                />
              </div>
              <div>
                <span className="text-xs text-slate-500">lost</span>
                <Input
                  type="number"
                  step="0.1"
                  value={member.uph?.lost ?? 0}
                  onChange={(e) => updateUph('lost', Number(e.target.value))}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
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
