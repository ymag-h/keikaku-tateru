import { useEffect, useMemo, useState } from 'react';
import { Save, User as UserIcon, Users as UsersIcon, LayoutGrid, Eye, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from '../MembersTab';
import type { Role } from '@/lib/roles';
import { DEFAULT_ROLES, getRoleColorPreset, sortedRoles } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { getLocalUserLogin, setLocalUserLogin } from '@/lib/localPrefs';

export type AppMetaLayout = {
  show_forecast_panel?: boolean; // Daily 処理予測パネルを表示するか (default: true)
};

export type AppMeta = {
  schema_version?: string;
  team_name?: string;
  description?: string;
  default_slots?: Record<string, number>;
  layout?: AppMetaLayout;
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
  // rolesSorted を useMemo で参照固定化 (毎レンダー新配列だと useEffect が無限に走る)
  const rolesSorted = useMemo(() => sortedRoles(effectiveRoles), [effectiveRoles]);

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
  const [showForecastDraft, setShowForecastDraft] = useState<boolean>(true);
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    kind: 'ok' | 'error';
    msg: string;
    details?: string[];
  } | null>(null);

  // meta 変化時だけ slotsDraft 初期化 (入力中の値をリセットしない)
  useEffect(() => {
    setTeamName(meta?.team_name ?? '');
    setDescription(meta?.description ?? '');
    const base: Record<string, number> = {};
    for (const r of rolesSorted) {
      base[r.id] = meta?.default_slots?.[r.id] ?? 0;
    }
    setSlotsDraft(base);
    // layout 初期化 (default: true)
    setShowForecastDraft(meta?.layout?.show_forecast_panel !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

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
    const safe = Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
    setSlotsDraft((prev) => ({ ...prev, [roleId]: safe }));
  };

  const handleSaveLayout = async () => {
    setSavingLayout(true);
    setLayoutStatus(null);
    try {
      const payload: AppMeta = {
        ...(meta ?? {}),
        schema_version: meta?.schema_version ?? '1.1.0',
        team_name: meta?.team_name ?? teamName,
        description: meta?.description ?? description,
        default_slots: meta?.default_slots,
        layout: {
          ...(meta?.layout ?? {}),
          show_forecast_panel: showForecastDraft,
        },
        updated_at: new Date().toISOString(),
      };
      const r = await window.api.writeConfig('app_meta.json', payload);
      if (r.ok) {
        setLayoutStatus({ kind: 'ok', msg: '保存しました' });
        onSaved?.();
        setTimeout(() => setLayoutStatus(null), 2500);
      } else {
        setLayoutStatus({ kind: 'error', msg: r.error ?? '保存失敗' });
      }
    } catch (e) {
      setLayoutStatus({ kind: 'error', msg: String(e) });
    } finally {
      setSavingLayout(false);
    }
  };

  // 上書き確認用 state
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    filePath: string;
    existingDates: string[];
    newDates: string[];
  } | null>(null);

  const formatImportResult = (r: Awaited<ReturnType<typeof window.api.importFromXlsx>>) => {
    const lines = [
      `Actuals: ${r.actualsCount} ファイル (${r.loginCount} 人)`,
      `Plans 新規: ${r.plansCount} ファイル`,
      `期間: ${r.dateRange}`,
    ];
    if ((r.plansSkipped ?? 0) > 0) lines.push(`Plans スキップ: ${r.plansSkipped} ファイル (既存)`);
    if ((r.plansOverwritten ?? 0) > 0) lines.push(`Plans 上書き: ${r.plansOverwritten} ファイル`);
    if ((r.unmappedItems?.length ?? 0) > 0) {
      lines.push(`未マッピング: ${r.unmappedItems!.length} 項目 (自動ID生成済)`);
    }
    return lines.join(' / ');
  };

  // 差分インポート (既存 plans はスキップ)
  const handleMergeImport = async () => {
    setImporting(true);
    setImportResult(null);
    setPendingOverwrite(null);
    try {
      const r = await window.api.importFromXlsx({ mode: 'merge' });
      if (r.ok) {
        setImportResult({ kind: 'ok', msg: formatImportResult(r), details: r.unmappedItems });
        onSaved?.();
      } else {
        setImportResult({ kind: 'error', msg: r.error ?? 'インポート失敗' });
      }
    } catch (e) {
      setImportResult({ kind: 'error', msg: String(e) });
    } finally {
      setImporting(false);
    }
  };

  // 上書きインポート: まずプレビュー → 重複あれば確認
  const handleOverwriteImport = async () => {
    setImporting(true);
    setImportResult(null);
    setPendingOverwrite(null);
    try {
      const preview = await window.api.importFromXlsx({ mode: 'preview' });
      if (!preview.ok) {
        setImportResult({ kind: 'error', msg: preview.error ?? 'プレビュー失敗' });
        return;
      }
      const existing = preview.existingPlanDates ?? [];
      if (existing.length === 0) {
        // 重複なし → そのまま上書きモードでインポート
        const r = await window.api.importFromXlsx({ mode: 'overwrite', filePath: preview.filePath });
        if (r.ok) {
          setImportResult({ kind: 'ok', msg: formatImportResult(r), details: r.unmappedItems });
          onSaved?.();
        } else {
          setImportResult({ kind: 'error', msg: r.error ?? 'インポート失敗' });
        }
      } else {
        // 重複あり → 確認 UI を表示
        setPendingOverwrite({
          filePath: preview.filePath!,
          existingDates: existing,
          newDates: preview.newPlanDates ?? [],
        });
      }
    } catch (e) {
      setImportResult({ kind: 'error', msg: String(e) });
    } finally {
      setImporting(false);
    }
  };

  // 確認後の上書き実行
  const handleConfirmOverwrite = async () => {
    if (!pendingOverwrite) return;
    setImporting(true);
    setImportResult(null);
    try {
      const r = await window.api.importFromXlsx({
        mode: 'overwrite',
        filePath: pendingOverwrite.filePath,
      });
      if (r.ok) {
        setImportResult({ kind: 'ok', msg: formatImportResult(r), details: r.unmappedItems });
        onSaved?.();
      } else {
        setImportResult({ kind: 'error', msg: r.error ?? 'インポート失敗' });
      }
    } catch (e) {
      setImportResult({ kind: 'error', msg: String(e) });
    } finally {
      setImporting(false);
      setPendingOverwrite(null);
    }
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

      {/* ---- セクション4: レイアウト (表示パネル) ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-5 w-5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">レイアウト (表示パネル)</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          計画マスタ・配信用の各画面で、どのパネルを表示するかを切り替えます。
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showForecastDraft}
              onChange={(e) => setShowForecastDraft(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">
              Daily 処理予測パネル (Backlog / JPH / Plan LH) を表示する
            </span>
          </label>
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleSaveLayout}
              disabled={savingLayout}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Save className="mr-1 h-4 w-4" />
              {savingLayout ? '保存中…' : 'レイアウトを保存'}
            </Button>
            {layoutStatus && (
              <span
                className={`text-xs ${
                  layoutStatus.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {layoutStatus.msg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ---- セクション5: データインポート ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-5 w-5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">データインポート</h3>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            QA計画実績 xlsx / xlsm (「実績蓄積」シート) から actuals + plans をインポートします。
          </p>

          {/* 差分インポート + 上書きインポート */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleMergeImport}
              disabled={importing}
              variant="outline"
              className="border-slate-300"
            >
              <Upload className="mr-1 h-4 w-4" />
              {importing ? 'インポート中…' : '差分インポート'}
            </Button>
            <Button
              size="sm"
              onClick={handleOverwriteImport}
              disabled={importing}
              variant="outline"
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
            >
              <AlertTriangle className="mr-1 h-4 w-4" />
              上書きインポート
            </Button>
          </div>
          <p className="text-[10px] text-slate-400">
            差分: 既存 plans はスキップ (新規日のみ追加) / 上書き: 重複日があれば確認後に上書き
          </p>

          {/* 上書き確認 UI */}
          {pendingOverwrite && (
            <div className="rounded border-2 border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                上書き確認
              </div>
              <p className="mt-1 text-xs text-amber-800">
                以下の <span className="font-bold">{pendingOverwrite.existingDates.length}</span> 日分の計画データが上書きされます:
              </p>
              <div className="mt-1 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {pendingOverwrite.existingDates.map((d) => (
                  <span key={d} className="text-[10px] px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded font-mono">
                    {d}
                  </span>
                ))}
              </div>
              {pendingOverwrite.newDates.length > 0 && (
                <p className="mt-1 text-[10px] text-amber-700">
                  + 新規 {pendingOverwrite.newDates.length} 日分も追加されます
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirmOverwrite}
                  disabled={importing}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {importing ? '上書き中…' : '上書きを実行'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingOverwrite(null)}
                  disabled={importing}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          {/* 結果表示 */}
          {importResult && (
            <div
              className={`rounded p-2 text-xs ${
                importResult.kind === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <div className="font-medium">{importResult.kind === 'ok' ? '✓ インポート完了' : '✗ エラー'}</div>
              <div className="mt-1">{importResult.msg}</div>
              {importResult.details && importResult.details.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-slate-600 hover:text-slate-800">
                    未マッピング項目を表示 ({importResult.details.length}件)
                  </summary>
                  <div className="mt-1 max-h-32 overflow-y-auto text-[10px] font-mono text-slate-500">
                    {importResult.details.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
