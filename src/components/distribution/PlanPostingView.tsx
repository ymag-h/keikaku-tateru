import { useMemo } from 'react';
import type { Member } from '../MembersTab';
import type { RoutinesFile } from '../RoutinesTab';
import {
  type DailyPlan,
  type PlanSlots,
  forecastRoutineIds,
  routinesForRole,
  getSlotLogins,
} from '@/lib/planUtils';
import { plannedRoles, getRolePanelClasses, type Role } from '@/lib/roles';

type Props = {
  plan: DailyPlan | null;
  members: Member[];
  routines: RoutinesFile | null;
  planSlots: PlanSlots;
  roles?: Role[];
};

export function PlanPostingView({ plan, members, routines, roles }: Props) {
  const rolesInPlan = useMemo(() => plannedRoles(roles ?? []), [roles]);

  if (!plan || !routines) {
    return <p className="text-sm text-muted-foreground p-6">計画データなし</p>;
  }

  const displayName = (login: string | null) =>
    login ? members.find((m) => m.login === login)?.name ?? login : '';

  const getPlanLh = (login: string | null, routineId: string): number => {
    if (!login) return 0;
    return plan.assignments[login]?.[routineId] ?? 0;
  };

  // ---------- Cell スタイル ----------
  const th = 'border border-gray-400 px-2 py-1 text-xs font-semibold text-gray-800 text-center whitespace-nowrap';
  const td = 'border border-gray-400 px-2 py-1 text-xs text-gray-800 whitespace-nowrap';
  const tdNum = 'border border-gray-400 px-2 py-1 text-xs text-gray-800 text-right font-mono whitespace-nowrap';
  const bgLabel = 'bg-orange-100';
  const bgHeader = 'bg-orange-200';
  const bgPink = 'bg-pink-100';
  const bgRose = 'bg-rose-100';
  const bgViolet = 'bg-violet-100';
  const bgGreen = 'bg-green-100';
  const bgBlue = 'bg-blue-100';
  const bgAmber = 'bg-amber-100';
  const bgEmerald = 'bg-emerald-100';

  // ---------- 左上: 処理予測テーブル ----------
  const LeftForecastTable = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel} w-32`}></th>
          <th className={`${th} ${bgHeader} w-20`}>発生予測</th>
          <th className={`${th} ${bgHeader} w-16`}>backlog</th>
          <th className={`${th} ${bgLabel} w-20`}>目標JPH</th>
          <th className={`${th} ${bgViolet} w-16`}>必要LH</th>
          <th className={`${th} ${bgViolet} w-16`}>Plan LH</th>
          <th className={`${th} ${bgHeader} w-20`}>過不足LH</th>
          <th className={`${th} ${bgHeader} w-20`}>リスク</th>
        </tr>
      </thead>
      <tbody>
        {forecastRoutineIds(routines).map((id) => {
          const r = routines.daily.find((x) => x.id === id);
          const shortName = r?.name ?? id;
          const fc = plan.processing_forecasts[id];
          const need = fc?.plan_lh ?? 0;
          const assigned = Object.values(plan.assignments).reduce(
            (s, rec) => s + (rec[id] ?? 0),
            0,
          );
          const diff = assigned - need;
          return (
            <tr key={id}>
              <td className={`${td} ${bgPink} font-medium`}>{shortName}</td>
              <td className={`${tdNum} bg-white`}>
                {fc?.forecast_units != null ? fc.forecast_units : '-'}
              </td>
              <td className={`${tdNum} bg-white`}>{fc?.backlog_units ?? 0}</td>
              <td className={`${tdNum} bg-white`}>
                {fc?.target_jph != null ? fc.target_jph : '-'}
              </td>
              <td
                className={`${tdNum} ${
                  need > 0 ? 'bg-white text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {need > 0 ? need.toFixed(1) : '-'}
              </td>
              <td
                className={`${tdNum} ${
                  need > 0 ? 'bg-white text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {need > 0 ? need.toFixed(1) : '-'}
              </td>
              <td className={`${tdNum} bg-white`}>{diff.toFixed(1)}</td>
              <td className={`${td} text-[11px] text-gray-600 bg-white`}>
                {fc?.risk_note ?? 'なし'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ---------- 左中: Adhoc/task/KAIZEN ----------
  const LeftAdhocTable = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel}`} colSpan={5}>
            <span className="text-sm">Adhoc/task/KAIZEN</span>
          </th>
        </tr>
        <tr>
          <th className={`${th} ${bgLabel} w-32`}></th>
          <th className={`${th} ${bgLabel} w-16`}>who</th>
          <th className={`${th} ${bgLabel} w-20`}>必要LH</th>
          <th className={`${th} ${bgLabel} w-20`}>進捗(%)</th>
          <th className={`${th} ${bgLabel} w-24`}>Due</th>
        </tr>
      </thead>
      <tbody>
        {plan.adhoc_tasks.length === 0 ? (
          <tr>
            <td className={`${td} text-gray-400 text-center`} colSpan={5}>
              なし
            </td>
          </tr>
        ) : (
          plan.adhoc_tasks.map((t) => (
            <tr key={t.id}>
              <td className={td}>{t.label}</td>
              <td className={td}>{t.who}</td>
              <td className={tdNum}>{t.need_lh.toFixed(1)}</td>
              <td className={tdNum}>{t.progress}</td>
              <td className={td}>{t.due.slice(5)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  // ---------- 左下: WeeklyRoutine ----------
  const LeftWeeklyTable = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel}`} colSpan={6}>
            <span className="text-sm">WeeklyRoutine</span>
          </th>
        </tr>
        <tr>
          <th className={`${th} ${bgHeader} w-52`}>種類</th>
          <th className={`${th} ${bgGreen} w-14`}>完了</th>
          <th className={`${th} ${bgHeader} w-14`}>Total</th>
          <th className={`${th} ${bgHeader} w-20`}>現使用LH</th>
          <th className={`${th} ${bgHeader} w-14`}>進捗</th>
          <th className={`${th} ${bgHeader} w-20`}>必要LH</th>
        </tr>
      </thead>
      <tbody>
        {routines.weekly.map((w) => {
          const wp = plan.weekly_progress[w.id];
          const need = wp?.need_lh ?? w.default_need ?? 0;
          const done = wp?.done_lh ?? 0;
          const pct = need > 0 ? Math.round((done / need) * 100) : 0;
          const remaining = need - done;
          const completed = wp?.completed ?? false;
          const doneBg = 'bg-slate-500 text-slate-100 line-through';
          const numCls = (v: number) =>
            completed
              ? `${tdNum} ${doneBg}`
              : `${tdNum} ${v > 0 ? 'bg-white' : 'bg-gray-100 text-gray-400'}`;
          return (
            <tr key={w.id}>
              <td className={`${td} ${completed ? doneBg : ''}`} title={w.name}>
                {w.name}
              </td>
              <td
                className={`${td} text-center ${
                  completed ? 'bg-slate-600 text-slate-100' : bgGreen
                }`}
              >
                {completed ? '✓' : ''}
              </td>
              <td className={numCls(need)}>{need > 0 ? need.toFixed(1) : '-'}</td>
              <td className={numCls(done)}>{done > 0 ? done.toFixed(1) : '-'}</td>
              <td className={numCls(pct)}>{pct > 0 ? pct : '-'}</td>
              <td
                className={
                  completed
                    ? `${tdNum} ${doneBg}`
                    : `${tdNum} ${
                        remaining > 0 ? 'bg-white text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'
                      }`
                }
              >
                {remaining > 0 ? remaining.toFixed(1) : '-'}
              </td>
            </tr>
          );
        })}
        <tr>
          <td className={`${td} ${bgLabel} font-bold`}>合計</td>
          <td className={`${td} ${bgLabel}`}></td>
          <td className={`${tdNum} ${bgLabel} font-bold`}>
            {routines.weekly
              .reduce((s, w) => s + (plan.weekly_progress[w.id]?.need_lh ?? w.default_need ?? 0), 0)
              .toFixed(1)}
          </td>
          <td className={`${tdNum} ${bgLabel} font-bold`}>
            {routines.weekly
              .reduce((s, w) => s + (plan.weekly_progress[w.id]?.done_lh ?? 0), 0)
              .toFixed(1)}
          </td>
          <td className={`${td} ${bgLabel}`}></td>
          <td className={`${tdNum} ${bgLabel} font-bold text-blue-800`}>
            {routines.weekly
              .reduce((s, w) => {
                const need = plan.weekly_progress[w.id]?.need_lh ?? w.default_need ?? 0;
                const done = plan.weekly_progress[w.id]?.done_lh ?? 0;
                return s + Math.max(0, need - done);
              }, 0)
              .toFixed(1)}
          </td>
        </tr>
      </tbody>
    </table>
  );

  // ---------- 中央: 汎用 Role テーブル ----------
  const renderRoleTable = (role: Role) => {
    const rc = getRolePanelClasses(role.color);
    const logins = getSlotLogins(plan, role.id);
    const roleRoutines = routinesForRole(routines, role.id);
    return (
      <table key={role.id} className="border-collapse">
        <thead>
          {/* 「計画」ラベル行 */}
          <tr>
            <th
              className={`${th} ${rc.headBg} ${rc.headText} text-sm`}
              colSpan={1 + logins.length}
            >
              計画 ({role.name})
            </th>
          </tr>
          <tr>
            <th className={`${th} ${bgLabel} w-52`} rowSpan={3}>
              項目
            </th>
            {logins.map((_, i) => (
              <th key={`h-${i}`} className={`${th} ${bgLabel}`}>
                担当
              </th>
            ))}
          </tr>
          <tr>
            {logins.map((l, i) => (
              <th key={`n-${i}`} className={`${th} ${rc.columnHeadBg} ${rc.columnHeadText} text-sm font-bold`}>
                {displayName(l) || '(未)'}
              </th>
            ))}
          </tr>
          <tr>
            {logins.map((_, i) => (
              <th key={`p-${i}`} className={`${th} ${rc.columnHeadBg} ${rc.columnHeadText} w-20`}>
                Plan LH
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roleRoutines.map((r) => {
            // routine.id 依存の背景色 (QC的な業務ラベルは維持)
            let labelBg = 'bg-white';
            if (/andon|tt/i.test(r.id)) labelBg = bgPink;
            else if (/dpt|迷子/i.test(r.id)) labelBg = bgRose;
            else if (/erdr|pickshort|whd|concession/i.test(r.id)) labelBg = bgViolet;
            return (
              <tr key={r.id}>
                <td className={`${td} ${labelBg} font-medium`} title={r.name}>
                  {r.name}
                </td>
                {logins.map((l, i) => {
                  const v = getPlanLh(l, r.id);
                  const has = !!l && v > 0;
                  return (
                    <td
                      key={`v-${i}`}
                      className={`${tdNum} ${
                        has ? 'bg-white text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {has ? v.toFixed(1) : '-'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* custom routines */}
          {plan.custom_routines
            .filter((c) => c.role === role.id)
            .map((c) => (
              <tr key={c.id}>
                <td className={`${td} bg-amber-50 italic font-medium`}>
                  {c.label || '(臨時)'}
                </td>
                {logins.map((l, i) => {
                  const has = l === c.login;
                  return (
                    <td
                      key={`cv-${i}`}
                      className={`${tdNum} ${
                        has ? 'bg-amber-50 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {has ? c.lh.toFixed(1) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          <tr>
            <td className={`${td} ${bgLabel} font-bold`}>合計</td>
            {logins.map((l, i) => {
              const sum = l
                ? roleRoutines.reduce((s, r) => s + getPlanLh(l, r.id), 0) +
                  plan.custom_routines
                    .filter((c) => c.login === l && c.role === role.id)
                    .reduce((s, c) => s + c.lh, 0)
                : 0;
              return (
                <td
                  key={`tot-${i}`}
                  className={`${tdNum} ${bgLabel} font-bold text-blue-800`}
                >
                  {l ? sum.toFixed(1) : '-'}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    );
  };

  // ---------- 右: 余剰LH 残HC ----------
  // 全 Role の capacity / totalPlan 合算 (Daily 表示用)
  const totalCapacity = rolesInPlan.reduce((s, role) => {
    const logins = getSlotLogins(plan, role.id);
    return (
      s +
      logins.reduce(
        (ss, l) => ss + (l ? members.find((m) => m.login === l)?.daily_hours ?? 7 : 0),
        0,
      )
    );
  }, 0);
  const totalPlan = rolesInPlan.reduce((s, role) => {
    const rr = routinesForRole(routines, role.id);
    const logins = getSlotLogins(plan, role.id);
    return (
      s +
      logins.reduce(
        (ss, l) =>
          ss +
          (l
            ? rr.reduce((x, r) => x + getPlanLh(l, r.id), 0) +
              plan.custom_routines
                .filter((c) => c.login === l && c.role === role.id)
                .reduce((x, c) => x + c.lh, 0)
            : 0),
        0,
      )
    );
  }, 0);

  const RightSurplusBlock = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel} w-28`}>余剰LH</th>
          <th className={`${th} ${bgLabel} w-20`}>残HC</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={`${td} ${bgBlue} font-medium`}>Daily</td>
          <td className={`${tdNum} ${bgBlue}`}>{(totalCapacity - totalPlan).toFixed(1)}</td>
        </tr>
        <tr>
          <td className={`${td} ${bgAmber} font-medium`}>TT/andon</td>
          <td className={`${tdNum} ${bgAmber}`}>-</td>
        </tr>
        <tr>
          <td className={`${td} ${bgEmerald} font-medium`}>Weekly</td>
          <td className={`${tdNum} ${bgEmerald}`}>
            {routines.weekly
              .reduce((s, w) => {
                const need = plan.weekly_progress[w.id]?.need_lh ?? w.default_need ?? 0;
                const done = plan.weekly_progress[w.id]?.done_lh ?? 0;
                return s + Math.max(0, need - done);
              }, 0)
              .toFixed(1)}
          </td>
        </tr>
        <tr>
          <td className={`${td} bg-gray-100 font-medium`}>Routine外</td>
          <td className={`${tdNum} bg-gray-100`}>-</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div className="flex items-start gap-6 p-4 bg-white">
      {/* ---- 左カラム ---- */}
      <div className="flex flex-col gap-4">
        {/* コメント */}
        <div className="w-[640px] border border-gray-400 p-2">
          <div className="text-xs font-bold text-gray-800 mb-1">コメント</div>
          <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
            {plan.comment || '(コメントなし)'}
          </div>
        </div>
        {LeftForecastTable}
        {LeftAdhocTable}
        {LeftWeeklyTable}
      </div>

      {/* ---- 中央カラム (全 Role 縦積み) ---- */}
      <div className="flex flex-col gap-4">
        {rolesInPlan.map((role) => renderRoleTable(role))}
      </div>

      {/* ---- 右カラム ---- */}
      <div className="flex flex-col gap-4">{RightSurplusBlock}</div>
    </div>
  );
}
