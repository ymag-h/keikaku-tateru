// QA Plan App - 共通型定義

export interface Member {
  login: string | null;
  name: string;
  role: "QC" | "Lead" | "Temp" | "PA";
  daily_hours: number;
  uph: { andon: number | null; sim: number | null; lost: number | null };
}

export interface MembersConfig {
  schema_version: string;
  fc: string;
  imported_at: string;
  members: Member[];
}

export interface RoutineDef {
  id: string;
  name: string;
  category?: "forecast" | "backlog" | "fixed";
  default_lh?: number;
  jph?: number;
  order: number;
}

export interface WeeklyRoutineDef {
  id: string;
  name: string;
  default_need: number;
}

export interface RoutinesConfig {
  schema_version: string;
  imported_at: string;
  daily: RoutineDef[];
  weekly: WeeklyRoutineDef[];
  design_target_hours_per_day: number;
}

export interface ShiftConfig {
  schema_version: string;
  month: string;
  imported_at: string;
  updated_at?: string;
  entries: Record<string, Record<string, boolean>>;
}

export interface AirBinsConfig {
  schema_version: string;
  imported_at: string;
  bins: string[];
}

export type RiskLevel = "ok" | "warn" | "danger";
export type RoutineStatus = "not_started" | "in_progress" | "done" | "blocked";

export interface ForecastEntry {
  forecast_units: number | null;
  backlog_units: number;
  plan_lh: number;
  risk: RiskLevel;
}

export interface DailyPlan {
  schema_version: string;
  date: string;
  fc: string;
  comment: string;
  forecasts: Record<string, ForecastEntry>;
  assignments: Record<string, Record<string, number>>;
  weekly_progress: Record<string, { done_lh: number; need_lh: number; completed: boolean }>;
}

export interface ActualEntry {
  act_lh: number;
  job_units: number | null;
  done: boolean;
  note?: string;
}

export interface UserActual {
  schema_version: string;
  login: string;
  date: string;
  updated_at: string;
  entries: Record<string, ActualEntry>;
}
