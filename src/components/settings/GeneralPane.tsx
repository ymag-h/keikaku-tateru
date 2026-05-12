import { useEffect, useState } from 'react';
import { Save, User as UserIcon, Users as UsersIcon, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from '../MembersTab';
import type { Role } from '@/lib/roles';
import { DEFAULT_ROLES, getRoleColorPreset, sortedRoles } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { getLocalUserLogin, setLocalUserLogin } from '@/lib/localPrefs';

export type AppMeta = {
  schema_version?: string;
  team_name?: string;
  description?: string;
  default_slots?: Record<string, number>;
  updated_at?: string;
};

type Props = {
  meta: AppMeta | null;
  members: Member[];
  roles?: Role[];
  onSaved?: () => void;
};

export function GeneralPane({ meta, members, roles, onSaved }: Props) {
  const effectiveRoles = roles ?? DEFAULT_ROLES;
  const rolesSorted = sortedRoles(effectiveRoles);

  const [userLogin, setUserLogin] = useState<string>(getLocalUserLogin() ?? '');
  const [teamName, setTeamName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [slotsDraft, setSlotsDraft] = useState<Record<string, number>>({});
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);
  const [metaStatus, setMetaStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );
  const [slotsStatus, setSlotsStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );
  const [userStatus, setUserStatus] = useState<string | null>(null);

  useEffect(() => {
    setTeamName(meta?.team_name ?? '');
    setDescription(meta?.description ?? '');
    // default_slots が無ければ各 Role 0 で初期化
    const base: Record<string, number> = {};
    for (const r of rolesSorted) {
      base[r.id] = meta?.default_slots?.[r.id] ?? 0;
    }
    setSlotsDraft(base);
  }, [meta, rolesSorted]);

  const handleSaveUser = () => {
    setLocalUserLogin(userLogin || null);
    setUserStatus(userLogin ? `保存しました: ${userLogin}` : 'クリアしました');
    setTimeout(() => setUserStatus(null), 2500);
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    setMetaStatus(null);
    try {
      const payload: AppMeta = {
        ...(meta ?? {}),
        schema_version: meta?.schema_version ?? '1.1.0',
        team_name: teamName.trim(),
        description: description.trim(),
        updated_at: new Date().toISOString(),
      };
      const r = await window.api.writeConfig('app_meta.json', payload);
      if (r.ok) {
        setMetaStatus({ kind: 'ok', msg: '保存しました' });
        onSaved?.();
        setTimeout(() => setMetaStatus(null), 2500);
      } else {
        setMetaStatus({ kind: 'error', msg: r.error ?? '保存失敗' });
      }
    } catch (e) {
      setMetaStatus({ kind: 'error', msg: String(e) });
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveSlots = async () => {
    setSavingSlots(true);
    setSlotsStatus(null);
    try {
      const payload: AppMeta = {
        ...(meta ?? {}),
        schema_version: meta?.schema_version ?? '1.1.0',
        team_name: meta?.team_name ?? teamName,
        description: meta?.description ?? description,
        default_slots: slotsDraft,
        updated_at: new Date().toISOString(),
      };
      const r = await window.api.writeConfig('app_meta.json', payload);
      if (r.ok) {
        setSlotsStatus({ kind: 'ok', msg: '保存しました' });
        onSaved?.();
        setTimeout(() => setSlotsStatus(null), 2500);
      } else {
        setSlotsStatus({ kind: 'error', msg: r.error ?? '保存失敗' });
      }
    } catch (e) {
      setSlotsStatus({ kind: 'error', msg: String(e) });
    } finally {
      setSavingSlots(false);
    }
  };

  const updateSlot = (roleId: string, val: number) => {
    setSlotsDraft((prev) => ({ ...prev, [roleId]: Math.max(0, Math.floor(val)) }));
  };

  const selectedMember = members.find((m) => m.login === userLogin);

  return (
    <div className="space-y-6 p-1">
      {/* ---- セクション1: 自分の設定 (ローカル) ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">自分の設定 (このPCのみ)</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          このアプリを使っているあなた自身のログインIDです (ブラウザの localStorage に保存)。
          将来、実績入力で「自分の欄だけ編集可」などの制御に使います。
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700 w-24">ユーザーID</label>
          <select
            value={userLogin}
            onChange={(e) => setUserLogin(e.target.value)}
            className="h-9 flex-1 min-w-48 max-w-xs rounded border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="">(未設定)</option>
            {members.map((m) => (
              <option key={m.login} value={m.login}>
                {m.name} ({m.login}) — {m.role ?? 'QC'}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={handleSaveUser}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Save className="mr-1 h-4 w-4" />
            保存
          </Button>
          {userStatus && (
            <span className="text-xs text-emerald-600">{userStatus}</span>
          )}
        </div>
        {selectedMember && (
          <p className="mt-2 text-xs text-slate-500">
            現在: <span className="font-semibold text-slate-700">{selectedMember.name}</span>
            {' '}/ role: {selectedMember.role ?? 'QC'}
            {' '}/ daily_hours: {selectedMember.daily_hours ?? 7}h
          </p>
        )}
      </section>

      {/* ---- セクション2: 共有設定 ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">共有設定 (チーム共通)</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          共有フォルダ config/app_meta.json に保存されます。チーム全員で共通の表示になります。
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 w-24">チーム名</label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="keikaku-qc"
              className="flex-1 max-w-xs"
            />
          </div>
          <div className="flex items-start gap-2">
            <label className="text-sm font-medium text-slate-700 w-24 pt-2">説明</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="NRT5 / HND2 QC チーム 計画実績アプリ"
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="w-24" />
            <Button
              size="sm"
              onClick={handleSaveMeta}
              disabled={savingMeta}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Save className="mr-1 h-4 w-4" />
              {savingMeta ? '保存中…' : '保存'}
            </Button>
            {metaStatus && (
              <span
                className={`text-xs ${
                  metaStatus.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {metaStatus.msg}
              </span>
            )}
          </div>
        </div>
        {meta?.updated_at && (
          <p className="mt-3 text-xs text-slate-400">
            最終更新: {new Date(meta.updated_at).toLocaleString('ja-JP')}
          </p>
        )}
      </section>

      {/* ---- セクション3: 計画担当枠数 (default_slots) ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">
            計画担当枠数 (Role 別)
          </h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          計画マスタの各 Role で、当日分の枠 (担当割当スロット) をいくつ用意するかの初期値です。
          Role の追加は「Roles」設定から行います。
        </p>
        <div className="space-y-2">
          {rolesSorted
            .filter((r) => r.show_in_plan)
            .map((r) => {
              const preset = getRoleColorPreset(r.color);
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium w-24 text-center',
                      preset.bg,
                      preset.text,
                    )}
                  >
                    {r.name}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={slotsDraft[r.id] ?? 0}
                    onChange={(e) => updateSlot(r.id, Number(e.target.value))}
                    className="h-9 w-24 text-sm text-center font-mono"
                  />
                  <span className="text-xs text-slate-500">枠</span>
                </div>
              );
            })}
          {rolesSorted.filter((r) => r.show_in_plan).length === 0 && (
            <p className="text-xs text-slate-400 italic">
              計画に表示する Role がありません。Roles 設定で show_in_plan を有効にしてください。
            </p>
          )}
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleSaveSlots}
              disabled={savingSlots}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Save className="mr-1 h-4 w-4" />
              {savingSlots ? '保存中…' : '枠数を保存'}
            </Button>
            {slotsStatus && (
              <span
                className={`text-xs ${
                  slotsStatus.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {slotsStatus.msg}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
