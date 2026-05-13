// 計画生成・計算ユーティリティ (Excelシート準拠)

import type { Member } from '@/components/MembersTab';
import type { RoutinesFile, DailyRoutine } from '@/components/RoutinesTab';
import type { ShiftsFile } from '@/components/ShiftsTab';

// --------------------------------------------------------------------
// 1. Daily処理件数ベース予測 (Excelシート B10-I16)
// Andon / Andon(air) / TT / TT(air) / 迷子 / Repair Bin など
// --------------------------------------------------------------------
export type ProcessingForecast = {
  forecast_units: number | null; // 発生予測数 (C列)
  backlog_units: number; // backlog (D列)
  target_jph: number | null; // 目標JPH (E列)
  plan_lh: number; // Plan LH (G列)
  risk_note: string; // リスク欄 (I列)
  assignees?: string[]; // 割当メンバー login 配列
};

// --------------------------------------------------------------------
// 2. Adhoc / task / KAIZEN (Excelシート B18+)
// --------------------------------------------------------------------
export type AdhocTask = {
  id: string;
  label: string;
  who: string;
  need_lh: number;
  progress: number; // 0-100
  due: string; // ISO date
};

// --------------------------------------------------------------------
// 3. Weekly進捗 (Excelシート B27-I39)
// --------------------------------------------------------------------
export type WeeklyProgress = {
  done_lh: number;
  need_lh: number;
  completed: boolean;
};

// --------------------------------------------------------------------
// PlanSlots: Role ID → 枠数
// --------------------------------------------------------------------
export type PlanSlots = Record<string, number>;

// --------------------------------------------------------------------
// DailyPlan 本体
// --------------------------------------------------------------------
export type DailyPlan = {
  schema_version: string;
  date: string;
  fc: string;
  comment: string;

  // Daily 処理件数予測 (key = routine.id)
  processing_forecasts: Record<string, ProcessingForecast>;

  // メンバー枠: Role ID ごとに枠番号順 login 配列 (null = 空き)
  slot_logins_by_role: Record<string, Array<string | null>>;

  // 担当別LH配分: assignments[login][routineId] = LH
  assignments: Record<string, Record<string, number>>;

  // Adhoc / task / KAIZEN
  adhoc_tasks: AdhocTask[];

  // Weekly進捗
  weekly_progress: Record<string, WeeklyProgress>;

  // メンバー別 当日限定追加ルーチン (SlotMatrix にその日だけ挿入される行)
  custom_routines: CustomRoutine[];
};

export type CustomRoutine = {
  id: string;
  label: string;
  login: string; // 対象メンバー
  role: string; // Role ID
  lh: number;
};

// --------------------------------------------------------------------
// 実績
// --------------------------------------------------------------------
export type ActualEntry = {
  act_lh: number;
  job_units: number | null;
  done: boolean;
  note?: string;
};

export type UserActual = {
  schema_version: string;
  login: string;
  date: string;
  updated_at: string;
  entries: Record<string, ActualEntry>;
};

// --------------------------------------------------------------------
// 処理件数ベースのルーチン (左ブロックに表示する対象)
// → routines.daily の jobs_count フラグで動的決定
// --------------------------------------------------------------------
export function forecastRoutineIds(routines: RoutinesFile | null): string[] {
  if (!routines) return [];
  return routines.daily
    .filter((r) => r.jobs_count)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id);
}

// 配信用・Backlog パネル表示対象 (hide_from_backlog を除外)
export function backlogRoutineIds(routines: RoutinesFile | null): string[] {
  if (!routines) return [];
  return routines.daily
    .filter((r) => r.jobs_count && !r.hide_from_backlog)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id);
}

// フォールバック用 (routines未ロード時の初期 plan 用)
export const FALLBACK_PROCESSING_IDS: readonly string[] = [
  'andon',
  'andon_air',
  'tt_メール対応',
  'tt_メール対応_air',
];

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------
export function getAttendees(
  members: Member[],
  shifts: ShiftsFile | null,
  date: string,
): Member[] {
  if (!shifts) return [];
  return members.filter((m) => m.login && shifts.entries[m.login]?.[date] === true);
}

export function totalCapacityLh(members: Member[]): number {
  return members.reduce((s, m) => s + (m.daily_hours ?? 7), 0);
}

export function totalAssignedLh(plan: DailyPlan, login?: string): number {
  if (login) {
    const rec = plan.assignments[login] ?? {};
    return Object.values(rec).reduce((s, v) => s + (v ?? 0), 0);
  }
  return Object.values(plan.assignments).reduce(
    (s, rec) => s + Object.values(rec).reduce((x, v) => x + (v ?? 0), 0),
    0,
  );
}

export function getSlotLogins(plan: DailyPlan, roleId: string): Array<string | null> {
  return plan.slot_logins_by_role[roleId] ?? [];
}

export function setSlotLoginAt(
  plan: DailyPlan,
  roleId: string,
  slotIdx: number,
  login: string | null,
): DailyPlan {
  const current = plan.slot_logins_by_role[roleId] ?? [];
  const next = [...current];
  next[slotIdx] = login;
  return {
    ...plan,
    slot_logins_by_role: { ...plan.slot_logins_by_role, [roleId]: next },
  };
}

export function resizeSlotLogins(
  plan: DailyPlan,
  roleId: string,
  size: number,
): DailyPlan {
  const current = plan.slot_logins_by_role[roleId] ?? [];
  if (current.length === size) return plan;
  const next = [...current];
  while (next.length < size) next.push(null);
  next.length = size;
  return {
    ...plan,
    slot_logins_by_role: { ...plan.slot_logins_by_role, [roleId]: next },
  };
}

export function totalPlanLhByRole(
  plan: DailyPlan,
  members: Member[],
  role: string,
): number {
  let total = 0;
  const logins = plan.slot_logins_by_role[role] ?? [];
  for (const login of logins) {
    if (!login) continue;
    const m = members.find((x) => x.login === login);
    if (!m || m.role !== role) continue;
    total += totalAssignedLh(plan, login);
  }
  return total;
}

export function computeRisk(
  totalPlan: number,
  capacity: number,
): 'ok' | 'warn' | 'danger' {
  if (capacity <= 0) return 'danger';
  const ratio = totalPlan / capacity;
  if (ratio > 1.1) return 'danger';
  if (ratio > 1.0) return 'warn';
  return 'ok';
}

// routineId に applicable な role かどうか
export function isRoutineApplicable(
  routine: DailyRoutine,
  role: string,
): boolean {
  const roles = routine.applicable_roles ?? ['QC'];
  return roles.includes(role);
}

// role別 routines 抽出
// by_role 辞書 (Role 専用カテゴリ) + daily のうち applicable_roles に含まれるもの
export function routinesForRole(
  routines: RoutinesFile | null,
  role: string,
): DailyRoutine[] {
  if (!routines) return [];
  const byRole = routines.by_role?.[role] ?? [];
  const fromDaily = routines.daily.filter((r) => isRoutineApplicable(r, role));
  const merged = [...byRole, ...fromDaily];
  return merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function createEmptyPlan(
  date: string,
  routines: RoutinesFile | null,
  slotCounts: PlanSlots,
): DailyPlan {
  const processing_forecasts: Record<string, ProcessingForecast> = {};
  const weekly_progress: Record<string, WeeklyProgress> = {};

  const forecastIds = routines
    ? forecastRoutineIds(routines)
    : [...FALLBACK_PROCESSING_IDS];
  for (const id of forecastIds) {
    processing_forecasts[id] = {
      forecast_units: null,
      backlog_units: 0,
      target_jph: null,
      plan_lh: 0,
      risk_note: 'なし',
      assignees: [],
    };
  }
  for (const w of routines?.weekly ?? []) {
    weekly_progress[w.id] = {
      done_lh: 0,
      need_lh: w.default_need ?? 0,
      completed: false,
    };
  }

  const slot_logins_by_role: Record<string, Array<string | null>> = {};
  for (const [roleId, count] of Object.entries(slotCounts)) {
    slot_logins_by_role[roleId] = Array(count).fill(null);
  }

  return {
    schema_version: '1.2.0',
    date,
    fc: 'NRT5',
    comment: '',
    processing_forecasts,
    slot_logins_by_role,
    assignments: {},
    adhoc_tasks: [],
    weekly_progress,
    custom_routines: [],
  };
}

// 旧スキーマ(1.0.0 / 1.1.0)の DailyPlan を 1.2.0 に変換
// - 1.1.0 → 1.2.0: qc_slot_logins / sub_slot_logins (旧special_slot_logins) → slot_logins_by_role
// - CustomRoutine.role: 'Special' → 'Sub'
export function migratePlanToV12(
  raw: unknown,
  routines: RoutinesFile | null,
  slotCounts: PlanSlots,
): DailyPlan {
  const plan = raw as Partial<DailyPlan> & {
    qc_slot_logins?: Array<string | null>;
    sub_slot_logins?: Array<string | null>;
    special_slot_logins?: Array<string | null>;
    forecasts?: Record<
      string,
      { forecast_units: number | null; backlog_units: number; plan_lh: number; risk: string }
    >;
  };
  if (plan.schema_version === '1.2.0') return plan as DailyPlan;

  const empty = createEmptyPlan(plan.date ?? '', routines, slotCounts);

  // slot_logins_by_role を組み立て
  const slot_logins_by_role: Record<string, Array<string | null>> = {};
  if (plan.slot_logins_by_role) {
    Object.assign(slot_logins_by_role, plan.slot_logins_by_role);
  } else {
    // 1.1.0 以前の旧スキーマ: qc_slot_logins → QC, sub_slot_logins / special_slot_logins → Sub
    if (plan.qc_slot_logins) slot_logins_by_role.QC = plan.qc_slot_logins;
    const subLogins = plan.sub_slot_logins ?? plan.special_slot_logins;
    if (subLogins) slot_logins_by_role.Sub = subLogins;
  }
  // slotCounts の各Roleに対して配列を確保 (新規Role追加時の対応)
  for (const [roleId, count] of Object.entries(slotCounts)) {
    if (!slot_logins_by_role[roleId]) {
      slot_logins_by_role[roleId] = Array(count).fill(null);
    }
  }

  const out: DailyPlan = {
    ...empty,
    date: plan.date ?? empty.date,
    fc: plan.fc ?? empty.fc,
    comment: plan.comment ?? '',
    assignments: plan.assignments ?? {},
    weekly_progress: plan.weekly_progress ?? empty.weekly_progress,
    custom_routines: (plan.custom_routines ?? []).map((c) => ({
      ...c,
      role: (c as unknown as { role: string }).role === 'Special' ? 'Sub' : c.role,
    })),
    adhoc_tasks: plan.adhoc_tasks ?? [],
    slot_logins_by_role,
    processing_forecasts: plan.processing_forecasts ?? empty.processing_forecasts,
  };
  // 旧 forecasts → processing_forecasts へマイグレート
  if (plan.forecasts) {
    const forecastIdSet = new Set(
      routines ? forecastRoutineIds(routines) : [...FALLBACK_PROCESSING_IDS],
    );
    for (const [k, v] of Object.entries(plan.forecasts)) {
      if (forecastIdSet.has(k)) {
        out.processing_forecasts[k] = {
          forecast_units: v.forecast_units,
          backlog_units: v.backlog_units,
          target_jph: null,
          plan_lh: v.plan_lh,
          risk_note: v.risk === 'ok' ? 'なし' : 'リスクあり',
        };
      }
    }
  }
  return out;
}

// 旧名 migratePlanToV11 も後方互換 (古い呼び出し側に備える)
export const migratePlanToV11 = migratePlanToV12;

export function computeActualTotalLh(actuals: UserActual[]): number {
  return actuals.reduce(
    (s, a) => s + Object.values(a.entries).reduce((x, e) => x + (e.act_lh ?? 0), 0),
    0,
  );
}

export function computeActualByRoutine(actuals: UserActual[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const a of actuals) {
    for (const [routineId, entry] of Object.entries(a.entries)) {
      result[routineId] = (result[routineId] ?? 0) + (entry.act_lh ?? 0);
    }
  }
  return result;
}
