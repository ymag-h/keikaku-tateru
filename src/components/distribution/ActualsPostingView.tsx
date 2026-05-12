import { useMemo } from 'react';
import type { Member } from '../MembersTab';
import type { RoutinesFile } from '../RoutinesTab';
import {
  type DailyPlan,
  type UserActual,
  type PlanSlots,
  forecastRoutineIds,
  routinesForRole,
  getSlotLogins,
} from '@/lib/planUtils';
import { plannedRoles, getRolePanelClasses, type Role } from '@/lib/roles';

type Props = {
  plan: DailyPlan | null;
  actuals: Record<string, UserActual>;
  members: Member[];
  routines: RoutinesFile;
  planSlots: PlanSlots;
  roles?: Role[];
};

export function ActualsPostingView({
  plan,
  actuals,
  members,
  routines,
  roles,
}: Props) {
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
  const getActLh = (login: string | null, routineId: string): number => {
    if (!login) return 0;
    return actuals[login]?.entries[routineId]?.act_lh ?? 0;
  };
  const getJob = (login: string | null, routineId: string): number | null => {
    if (!login) return null;
    return actuals[login]?.entries[routineId]?.job_units ?? null;
  };
  const calcJphPerson = (login: string | null, id: string): number | null => {
    if (!login) return null;
    const job = getJob(login, id);
    const lh = getActLh(login, id);
    if (!job || !lh || lh <= 0) return null;
    return job / lh;
  };

  // ---------- スタイル ----------
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

  // ReadOnly 表示 (画像キャプチャ用、入力は 実績入力タブ で)
  const numDisplay = (value: number | null, isInteger = false) => {
    const isEmpty = value === null || value === undefined || value === 0;
    const bgClass = isEmpty ? 'bg-gray-100 text-gray-400' : 'bg-white';
    const display = value == null ? '-' : isInteger ? String(value) : value.toFixed(1);
    return (
      <div className={`${bgClass} px-2 py-1 text-right text-xs font-mono`}>
        {display}
      </div>
    );
  };

  // 全 Role の login を集めた activeLogins (JPH 表用)
  const activeLogins = rolesInPlan
    .flatMap((role) => getSlotLogins(plan, role.id))
    .filter(Boolean) as string[];

  // ---------- 左上: 件数/必要LH/リスク ----------
  const LeftCountRiskTable = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel} w-28`}></th>
          <th className={`${th} ${bgHeader} w-16`}>件数</th>
          <th className={`${th} ${bgViolet} w-16`}>必要LH</th>
          <th className={`${th} ${bgHeader} w-48`}>リスク無し</th>
        </tr>
      </thead>
      <tbody>
        {forecastRoutineIds(routines).map((id) => {
          const r = routines.daily.find((x) => x.id === id);
          const shortName = r?.name ?? id;
          const fc = plan.processing_forecasts[id];
          return (
            <tr key={id}>
              <td className={`${td} ${bgPink} font-medium`}>{shortName}</td>
              <td className={`${tdNum} bg-white`}>
                {fc?.forecast_units ?? '-'}
              </td>
              <td className={`${tdNum} ${bgViolet} text-blue-700 font-semibold`}>
                {fc?.plan_lh != null ? fc.plan_lh.toFixed(1) : '-'}
              </td>
              <td className={`${td} text-[11px] text-gray-600 bg-white`}>
                {fc?.risk_note ?? ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ---------- 左中: JPH ----------
  const jphRoutines = routines.daily.filter((r) => r.jobs_count);
  const LeftJphTable = jphRoutines.length === 0 ? null : (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel} w-28`}></th>
          <th className={`${th} ${bgLabel} w-20`}>目標JPH</th>
          {activeLogins.map((l) => (
            <th key={l} className={`${th} ${bgLabel} w-16`}>
              {displayName(l)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {jphRoutines.map((r) => {
          const targetJph = plan.processing_forecasts[r.id]?.target_jph;
          return (
            <tr key={r.id}>
              <td className={`${td} ${bgPink} font-medium`}>{r.name}</td>
              <td className={`${tdNum} ${targetJph == null ? 'bg-gray-100 text-gray-400' : 'bg-white'}`}>
                {targetJph ?? '-'}
              </td>
              {activeLogins.map((l) => {
                const jph = calcJphPerson(l, r.id);
                const target = targetJph;
                let bg = 'bg-white';
                let text = '';
                if (jph == null) {
                  bg = 'bg-gray-100 text-gray-400';
                } else if (target != null) {
                  bg = jph >= target ? 'bg-green-100' : 'bg-red-100';
                  text = jph >= target ? 'text-green-800 font-semibold' : 'text-red-700 font-semibold';
                }
                return (
                  <td key={l} className={`${tdNum} ${bg} ${text}`}>
                    {jph != null ? jph.toFixed(1) : '-'}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ---------- 左下: Weekly ----------
  const LeftWeeklyTable = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel}`} colSpan={5}>
            <span className="text-sm">WeeklyRoutine進捗</span>
          </th>
        </tr>
        <tr>
          <th className={`${th} ${bgHeader}`}>種類</th>
          <th className={`${th} ${bgHeader} w-14`}>LH</th>
          <th className={`${th} ${bgGreen} w-14`}>完了</th>
          <th className={`${th} ${bgHeader} w-14`}>進捗</th>
          <th className={`${th} ${bgHeader} w-20`}>現使用LH</th>
        </tr>
      </thead>
      <tbody>
        {routines.weekly.map((w) => {
          const wp = plan.weekly_progress[w.id];
          const need = wp?.need_lh ?? w.default_need ?? 0;
          const done = wp?.done_lh ?? 0;
          const pct = need > 0 ? Math.round((done / need) * 100) : 0;
          const completed = wp?.completed ?? false;
          const cellBg = completed ? 'bg-slate-500 text-slate-100 line-through' : '';
          return (
            <tr key={w.id}>
              <td className={`${td} ${cellBg}`}>{w.name}</td>
              <td className={`${tdNum} ${cellBg}`}>{need.toFixed(1)}</td>
              <td
                className={`${td} text-center ${
                  completed ? 'bg-slate-600 text-slate-100' : bgGreen
                }`}
              >
                {completed ? '✓' : ''}
              </td>
              <td className={`${tdNum} ${cellBg}`}>{pct}</td>
              <td className={`${tdNum} ${cellBg}`}>{done.toFixed(1)}</td>
            </tr>
          );
        })}
        <tr>
          <td className={`${td} ${bgLabel} font-bold`}>合計</td>
          <td className={`${tdNum} ${bgLabel} font-bold`}>
            {routines.weekly
              .reduce((s, w) => s + (plan.weekly_progress[w.id]?.need_lh ?? w.default_need ?? 0), 0)
              .toFixed(1)}
          </td>
          <td className={`${td} ${bgLabel}`}></td>
          <td className={`${td} ${bgLabel}`}></td>
          <td className={`${tdNum} ${bgLabel} font-bold`}>
            {routines.weekly
              .reduce((s, w) => s + (plan.weekly_progress[w.id]?.done_lh ?? 0), 0)
              .toFixed(1)}
          </td>
        </tr>
      </tbody>
    </table>
  );

  // ---------- 中央: 汎用 Role テーブル (実績) ----------
  const renderRoleTable = (role: Role) => {
    const rc = getRolePanelClasses(role.color);
    const logins = getSlotLogins(plan, role.id);
    const roleRoutines = routinesForRole(routines, role.id);
    return (
      <table key={role.id} className="border-collapse">
        <thead>
          <tr>
            <th
              className={`${th} ${rc.headBg} ${rc.headText} text-sm`}
              colSpan={1 + logins.length * 3}
            >
              実績 ({role.name})
            </th>
          </tr>
          <tr>
            <th className={`${th} ${bgLabel} w-52`} rowSpan={3}>
              項目
            </th>
            {logins.map((_, i) => (
              <th key={`h-${i}`} className={`${th} ${bgLabel}`} colSpan={3}>
                担当
              </th>
            ))}
          </tr>
          <tr>
            {logins.map((l, i) => (
              <th
                key={`n-${i}`}
                className={`${th} ${rc.columnHeadBg} ${rc.columnHeadText} text-sm font-bold`}
                colSpan={3}
              >
                {displayName(l) || '(未)'}
              </th>
            ))}
          </tr>
          <tr>
            {logins.map((_, i) => (
              <>
                <th key={`p-${i}`} className={`${th} ${rc.columnHeadBg} ${rc.columnHeadText} w-16`}>
                  Plan LH
                </th>
                <th key={`a-${i}`} className={`${th} ${bgGreen} w-16`}>
                  Act(LH)
                </th>
                <th key={`j-${i}`} className={`${th} ${bgHeader} w-14`}>
                  Job
                </th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {roleRoutines.map((r) => {
            let labelBg = 'bg-white';
            if (/andon|tt/i.test(r.id)) labelBg = bgPink;
            else if (/dpt|迷子/i.test(r.id)) labelBg = bgRose;
            else if (/erdr|pickshort|whd|concession/i.test(r.id)) labelBg = bgViolet;
            return (
              <tr key={r.id}>
                <td className={`${td} ${labelBg} font-medium`}>{r.name}</td>
                {logins.map((l, i) => {
                  const planLh = getPlanLh(l, r.id);
                  return (
                    <>
                      <td
                        key={`p-${i}`}
                        className={`${tdNum} ${l && planLh > 0 ? 'bg-white text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {l && planLh > 0 ? planLh.toFixed(1) : '-'}
                      </td>
                      <td key={`a-${i}`} className={`${tdNum} p-0 ${l ? 'bg-white' : 'bg-gray-100 text-gray-400'}`}>
                        {l ? (
                          numDisplay(getActLh(l, r.id) || null)
                        ) : (
                          <span className="px-2">-</span>
                        )}
                      </td>
                      <td key={`j-${i}`} className={`${tdNum} p-0 ${l && r.jobs_count ? 'bg-white' : 'bg-gray-100 text-gray-400'}`}>
                        {l && r.jobs_count ? (
                          numDisplay(getJob(l, r.id), true)
                        ) : (
                          <span className="px-2">-</span>
                        )}
                      </td>
                    </>
                  );
                })}
              </tr>
            );
          })}
          {plan.custom_routines
            .filter((c) => c.role === role.id)
            .map((c) => (
              <tr key={c.id}>
                <td className={`${td} bg-amber-50 italic font-medium`}>
                  {c.label || '(臨時)'}
                </td>
                {logins.map((l, i) => {
                  const isOwner = l === c.login;
                  return (
                    <>
                      <td
                        key={`cp-${i}`}
                        className={`${tdNum} ${isOwner ? 'bg-amber-50 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {isOwner ? c.lh.toFixed(1) : '-'}
                      </td>
                      <td key={`ca-${i}`} className={`${tdNum} p-0 ${isOwner && l ? 'bg-amber-50' : 'bg-gray-100 text-gray-400'}`}>
                        {isOwner && l ? (
                          numDisplay(getActLh(l, c.id) || null)
                        ) : (
                          <span className="px-2">-</span>
                        )}
                      </td>
                      <td key={`cj-${i}`} className={`${tdNum} p-0 ${isOwner && l ? 'bg-white' : 'bg-gray-100 text-gray-400'}`}>
                        {isOwner && l ? (
                          numDisplay(getJob(l, c.id), true)
                        ) : (
                          <span className="px-2">-</span>
                        )}
                      </td>
                    </>
                  );
                })}
              </tr>
            ))}
          <tr>
            <td className={`${td} ${bgLabel} font-bold`}>合計</td>
            {logins.map((l, i) => {
              const pSum = l
                ? roleRoutines.reduce((s, r) => s + getPlanLh(l, r.id), 0) +
                  plan.custom_routines
                    .filter((c) => c.login === l && c.role === role.id)
                    .reduce((s, c) => s + c.lh, 0)
                : 0;
              const aSum = l
                ? roleRoutines.reduce((s, r) => s + getActLh(l, r.id), 0) +
                  plan.custom_routines
                    .filter((c) => c.login === l && c.role === role.id)
                    .reduce((s, c) => s + getActLh(l, c.id), 0)
                : 0;
              return (
                <>
                  <td
                    key={`tp-${i}`}
                    className={`${tdNum} ${bgLabel} font-bold text-blue-800`}
                  >
                    {l ? pSum.toFixed(1) : '-'}
                  </td>
                  <td
                    key={`ta-${i}`}
                    className={`${tdNum} ${bgLabel} font-bold text-green-800`}
                  >
                    {l ? aSum.toFixed(1) : '-'}
                  </td>
                  <td key={`tj-${i}`} className={`${tdNum} ${bgLabel}`}>
                    -
                  </td>
                </>
              );
            })}
          </tr>
        </tbody>
      </table>
    );
  };

  // ---------- 右上: 余剰LH 残HC (全 Role 合算) ----------
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
  const totalAct = rolesInPlan.reduce((s, role) => {
    const rr = routinesForRole(routines, role.id);
    const logins = getSlotLogins(plan, role.id);
    return (
      s +
      logins.reduce(
        (ss, l) =>
          ss +
          (l
            ? rr.reduce((x, r) => x + getActLh(l, r.id), 0) +
              plan.custom_routines
                .filter((c) => c.login === l && c.role === role.id)
                .reduce((x, c) => x + getActLh(l, c.id), 0)
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
          <td className={`${tdNum} ${bgBlue}`}>
            {(totalPlan - totalAct).toFixed(1)}
          </td>
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

  // ---------- 右中: Adhoc ----------
  const RightAdhocTable = (
    <table className="border-collapse">
      <thead>
        <tr>
          <th className={`${th} ${bgLabel}`} colSpan={4}>
            <span className="text-sm">Adhoc/task/KAIZEN</span>
          </th>
        </tr>
        <tr>
          <th className={`${th} ${bgLabel} w-14`}>who</th>
          <th className={`${th} ${bgLabel} w-16`}>必要LH</th>
          <th className={`${th} ${bgLabel} w-20`}>進捗(%)</th>
          <th className={`${th} ${bgLabel} w-24`}>Due</th>
        </tr>
      </thead>
      <tbody>
        {plan.adhoc_tasks.length === 0 ? (
          <tr>
            <td className={`${td} text-gray-400 text-center`} colSpan={4}>
              なし
            </td>
          </tr>
        ) : (
          plan.adhoc_tasks.map((t) => (
            <tr key={t.id}>
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

  return (
    <div className="flex items-start gap-6 p-4 bg-white">
      <div className="flex flex-col gap-4">
        {LeftCountRiskTable}
        {LeftJphTable && <div>{LeftJphTable}</div>}
        {LeftWeeklyTable}
      </div>
      {/* 中央カラム (全 Role 縦積み) */}
      <div className="flex flex-col gap-4">
        {rolesInPlan.map((role) => renderRoleTable(role))}
      </div>
      <div className="flex flex-col gap-4">
        {RightSurplusBlock}
        {RightAdhocTable}
      </div>
    </div>
  );
}
