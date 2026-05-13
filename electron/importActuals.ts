// 実績蓄積 xlsx → config/actuals + config/plans 変換ロジック
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

// ========== MANUAL MAPPING (xlsx 項目名 → routine ID) ==========
const MANUAL_MAP: Record<string, string> = {
  "Andon": "andon", "Andon(air)": "andon_air",
  "TT・メール対応": "tt_メール対応", "TT・メール対応(air)": "tt_メール対応_air",
  "TT・メール対応(HND2)": "tt_メール対応_hnd2",
  "ERDR 1st(NRT5)": "erdr_1st_nrt5", "ERDR_1st(NRT5)": "erdr_1st_nrt5",
  "ERDR_1st (NRT5)": "erdr_1st_nrt5", "ERDR 1st,2nd(NRT5)": "erdr_1st_nrt5",
  "ERDR 2nd(NRT5)": "erdr_2nd_nrt5", "ERDR 1st(HND2)": "erdr_1st_hnd2",
  "ERDR 2nd(HND2)": "erdr_2nd_hnd2", "ERDR 2nd TR": "erdr_2nd_nrt5",
  "ERDR Audit": "erdr_audit",
  "Concession Bincheck(NRT5)": "concession_bincheck_nrt5",
  "ConcessionBinCheck(NRT5)": "concession_bincheck_nrt5",
  "Concession BinCheck(NRT5)": "concession_bincheck_nrt5",
  "Concession bincheck": "concession_bincheck_nrt5",
  "Concession Bincheck(HND2)": "concession_bincheck_hnd2",
  "ConcessionQA": "concession_qa",
  "PickshortQA": "pickshortqa", "PickShortQA": "pickshortqa",
  "Daily PickshortQA": "pickshortqa", "Daily_PickShortQA": "pickshortqa",
  "Daily_PickshortQA": "pickshortqa", "Daily pickshortQA": "pickshortqa",
  "DailyPickShortQA": "pickshortqa", "Daily/PickshortQA": "pickshortqa",
  "Dayly PickshortQA": "pickshortqa", "Daily PickshortQA(Air)": "pickshortqa_air",
  "PickShortQA_TR": "pickshortqa_tr", "Daily Pickshort QA": "pickshortqa",
  "Daily Pickshort QA label貼り(1/16分)": "pickshortqa",
  "Daily PickshortQA/その他bincheck": "pickshortqa",
  "WHD回収/stow搬送": "whd回収_stow搬送", "WHD・Add依頼品回収": "whd_add依頼品回収",
  "WHD・Add依頼品回収/stow搬送": "whd回収_stow搬送",
  "WHD・Add依頼品回収/Stow搬送": "whd回収_stow搬送",
  "WHD回収・Stow搬送": "whd回収_stow搬送", "WHD回収": "whd回収_stow搬送",
  "Stow搬送": "stow搬送", "stow搬送": "stow搬送",
  "stow搬送/WHD回収": "whd回収_stow搬送",
  "QC計画": "qc計画", "Add/Delete": "add_delete",
  "No_exp / Merge": "no_exp_merge", "プレート残り/終業チェック": "プレート残り_終業チェック",
  "DPT": "dpt", "迷子": "special_迷子", "迷子(Air)": "special_迷子_air",
  "迷子BOXメンテナンス1→2→3→4階": "迷子boxメンテナンス",
  "迷子メンテナンス": "迷子boxメンテナンス",
  "Bin_Repair_Request": "special_bin_repair_request", "SBC": "special_sbc",
  "Bin チェック": "bincheck", "BinCheck": "bincheck", "Bincheck": "bincheck",
  "bincheck": "bincheck", "bin check": "bincheck",
  "bin check(Air)": "bincheck_air", "bincheck(SIM)": "bincheck_sim",
  "ASIN不明品": "asin不明品", "Asin不明品": "asin不明品",
  "ASIN不明品(2次QA)": "asin不明品_2次",
  "ASIN不明品(Amnesty Add Back)": "asin不明品_amnesty",
  "Pending-Research in Bin確認": "pending-research_in_bin確認",
  "tsIC020進捗確認": "tsic020進捗確認",
  "廃棄(1,3週)/備品発注(2,4週)": "廃棄_第1_3週_備品発注_第2_4週",
  "廃棄(第1,3週)/備品発注(第2,4週)": "廃棄_第1_3週_備品発注_第2_4週",
  "廃棄処理": "廃棄_第1_3週_備品発注_第2_4週",
  "KAIZEN": "kaizen", "KAIZEN TR": "kaizen_tr", "kaizen TR": "kaizen_tr",
  "KAIZEN/Task": "kaizen", "KAIZEN・Task": "kaizen", "KAIZEN・BinCheck": "kaizen",
  "Task": "task", "task": "task",
  "TR": "tr", "TR/振り返り": "tr", "TR・振り返り": "tr", "振り返り": "振り返り",
  "meeting": "meeting", "mtg": "meeting", "Mtg": "meeting", "1on1": "1on1",
  "LP-Tips": "lp_tips", "LP Tips": "lp_tips", "LP Tips作成": "lp_tips",
  "Lptips": "lp_tips", "LP-story": "lp_story", "LP投稿": "lp_tips",
  "SIM": "sim", "SIM Audit": "sim_audit", "SIM_Audit": "sim_audit",
  "Code-5 Top10 Bincheck(NRT5)": "code5_bincheck_nrt5",
  "コード５疑い": "code5_bincheck_nrt5",
  "NRT5/HND2間移動": "nrt5_hnd2間移動",
  "IRDR経過報告": "irdr経過報告", "IRDR報告": "irdr報告",
  "LPN_Bincheck": "lpn_bincheck",
  "Countミス　bincheck(Air)": "bincheck_air",
  "Daily Missing QA": "daily_missing_qa", "Daily QA": "daily_qa",
  "ラベル貼り": "ラベル貼り", "ASIN貼付": "ラベル貼り",
  "商品回収": "商品回収", "商品回収(Air)": "商品回収_air",
  "商品回収(Air含む)": "商品回収_air",
  "Outbound品質会議": "outbound品質会議", "Outbound品質対策": "outbound品質対策",
  "Outbound Audit": "outbound_audit", "Outbound SIM対応": "outbound_sim",
  "縦入れ是正Project": "縦入れ是正project",
  "縦積み是正": "縦入れ是正project", "縦積み是正巡回": "縦入れ是正project",
  "横積み是正": "横積み是正", "横積み是正完了巡回": "横積み是正",
  "エスカレ": "エスカレ", "エスカレ対応": "エスカレ",
  "トレーニング": "トレーニング", "休暇申請": "休暇申請", "面談": "面談",
  "QC TR": "qc_tr", "QC TR/振り返り": "qc_tr", "QC TR/mtg": "qc_tr",
  "Inbound Pending対応": "inbound_pending", "Pending対応": "inbound_pending",
  "Move": "move", "商品Move": "move",
  "bin repaire": "bin補修", "Bin補修": "bin補修",
  "Repair Bin": "bin補修", "Repair 補修": "bin補修",
  "棚是正": "棚是正", "棚是正状況確認": "棚是正", "棚破損対応": "棚是正",
  "搬送": "stow搬送",
  "Hazmat品Defective処理": "hazmat対応", "Hazmat品回収": "hazmat対応",
  "Hazmat返送対応": "hazmat対応",
  "HND2業務": "hnd2業務", "HND2 MAQ超過Status変更": "hnd2業務",
  "5S": "5s", "ICQAファイル2S": "5s", "フォルダ2S": "5s",
  "ファイル2S, Code-5疑い対応": "5s", "bin整理": "5s",
  "機器トラブル": "機器トラブル", "機器トラブル・補修": "機器トラブル",
  "PCトラブル": "機器トラブル",
  "電車遅延": "電車遅延", "午後VTO": "vto",
  "Audit": "audit", "shipdock audit": "audit", "メンテナンス": "メンテナンス",
};

// 決定的 auto-ID 生成: 同名 → 常に同じ ID
function autoId(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[（(]/g, '_').replace(/[）)]/g, '')
    .replace(/[\s/・\u3000]+/g, '_')
    .replace(/[^a-z0-9_\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function resolveRoutineId(
  name: string,
  nameToId: Record<string, string>,
): { id: string; mapped: boolean } {
  const trimmed = name.trim();
  if (!trimmed) return { id: '_blank', mapped: false };
  if (MANUAL_MAP[trimmed]) return { id: MANUAL_MAP[trimmed], mapped: true };
  if (nameToId[trimmed]) return { id: nameToId[trimmed], mapped: true };
  return { id: autoId(trimmed), mapped: false };
}

function excelToISO(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return d.toISOString().slice(0, 10);
}

export type ImportResult = {
  ok: boolean;
  actualsCount: number;
  plansCount: number;
  plansSkipped: number;
  plansOverwritten: number;
  loginCount: number;
  dateRange: string;
  unmappedItems: string[];
  error?: string;
};

export type PreviewResult = {
  ok: boolean;
  filePath: string;
  existingPlanDates: string[];
  newPlanDates: string[];
  totalRows: number;
  loginCount: number;
  error?: string;
};

export function importJissekiXlsx(
  xlsxPath: string,
  configDir: string,
  overwrite: boolean = false,
): ImportResult {
  // routines.json 読み込み → 逆引き
  const nameToId: Record<string, string> = {};
  const routinesPath = path.join(configDir, 'routines.json');
  if (fs.existsSync(routinesPath)) {
    const rf = JSON.parse(fs.readFileSync(routinesPath, 'utf8'));
    for (const r of [...(rf.daily ?? []), ...(rf.weekly ?? [])]) {
      nameToId[r.name] = r.id;
    }
  }

  // xlsx 読み込み
  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['実績蓄積'];
  if (!ws) {
    return { ok: false, actualsCount: 0, plansCount: 0, loginCount: 0,
      plansSkipped: 0, plansOverwritten: 0,
      dateRange: '', unmappedItems: [], error: '「実績蓄積」シートが見つかりません' };
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  const dataRows = rows.slice(1).filter((r) => r[9] != null && r[9] !== '');

  // グルーピング
  type RawEntry = {
    routineId: string; fcstLh: number | null; planLh: number | null;
    actLh: number | null; jobUnits: number | null;
  };
  const grouped: Record<string, RawEntry[]> = {};
  const unmapped = new Set<string>();

  for (const r of dataRows) {
    const item = String(r[3] ?? '').trim();
    if (!item) continue;
    const dateSerial = r[9];
    if (typeof dateSerial !== 'number') continue;
    const date = excelToISO(dateSerial);
    const login = String(r[10] ?? '').trim();
    if (!login) continue;

    const resolved = resolveRoutineId(item, nameToId);
    if (!resolved.mapped) unmapped.add(item);

    const fcstLh = typeof r[4] === 'number' ? r[4] : null;
    const planLhRaw = typeof r[6] === 'number' ? r[6] : null;
    const planLh = (planLhRaw != null && planLhRaw !== dateSerial
      && Math.abs(planLhRaw) < 100 && planLhRaw !== 0) ? planLhRaw : null;
    const actLh = typeof r[7] === 'number' ? r[7] : null;
    const jobUnits = typeof r[8] === 'number' ? r[8] : null;

    const key = `${date}|${login}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ routineId: resolved.id, fcstLh, planLh, actLh, jobUnits });
  }

  // actuals 生成
  const nowISO = new Date().toISOString();
  let actualsCount = 0;
  const loginSet = new Set<string>();
  const dateSet = new Set<string>();

  const planByDate: Record<string, {
    assignments: Record<string, Record<string, number>>;
    forecasts: Record<string, { fcstLh: number | null; planLh: number }>;
  }> = {};

  for (const [key, entries] of Object.entries(grouped)) {
    const [date, login] = key.split('|');
    loginSet.add(login);
    dateSet.add(date);

    const actualEntries: Record<string, { act_lh: number; job_units: number | null; done: boolean }> = {};
    for (const e of entries) {
      if (e.actLh == null && e.jobUnits == null) continue;
      if (!actualEntries[e.routineId]) {
        actualEntries[e.routineId] = { act_lh: 0, job_units: null, done: true };
      }
      actualEntries[e.routineId].act_lh += e.actLh ?? 0;
      if (e.jobUnits != null) {
        actualEntries[e.routineId].job_units =
          (actualEntries[e.routineId].job_units ?? 0) + e.jobUnits;
      }
    }

    if (Object.keys(actualEntries).length > 0) {
      const dir = path.join(configDir, 'actuals', login);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${date}.json`),
        JSON.stringify({
          schema_version: '1.0.0', login, date, updated_at: nowISO,
          entries: actualEntries,
        }, null, 2) + '\n',
        'utf8',
      );
      actualsCount++;
    }

    // Plan LH 集約
    for (const e of entries) {
      if (e.planLh == null) continue;
      if (!planByDate[date]) planByDate[date] = { assignments: {}, forecasts: {} };
      if (!planByDate[date].assignments[login]) planByDate[date].assignments[login] = {};
      planByDate[date].assignments[login][e.routineId] =
        (planByDate[date].assignments[login][e.routineId] ?? 0) + e.planLh;
      if (!planByDate[date].forecasts[e.routineId]) {
        planByDate[date].forecasts[e.routineId] = { fcstLh: null, planLh: 0 };
      }
      if (e.fcstLh != null) planByDate[date].forecasts[e.routineId].fcstLh = e.fcstLh;
      planByDate[date].forecasts[e.routineId].planLh += e.planLh;
    }
  }

  // plans 生成
  let plansCount = 0;
  let plansSkipped = 0;
  let plansOverwritten = 0;
  const plansDir = path.join(configDir, 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  for (const [date, data] of Object.entries(planByDate)) {
    const filePath = path.join(plansDir, `${date}.json`);
    const exists = fs.existsSync(filePath);
    if (exists && !overwrite) { plansSkipped++; continue; }
    if (exists) plansOverwritten++;
    const forecasts: Record<string, unknown> = {};
    for (const [rid, fc] of Object.entries(data.forecasts)) {
      forecasts[rid] = {
        forecast_units: fc.fcstLh, backlog_units: 0,
        target_jph: null, plan_lh: fc.planLh, risk_note: '',
      };
    }
    fs.writeFileSync(filePath, JSON.stringify({
      schema_version: '1.1.0', date, fc: 'NRT5',
      comment: '(imported from xlsx)',
      processing_forecasts: forecasts,
      slot_logins_by_role: {}, assignments: data.assignments,
      adhoc_tasks: [], weekly_progress: {}, custom_routines: [],
    }, null, 2) + '\n', 'utf8');
    plansCount++;
  }

  const sortedDates = [...dateSet].sort();
  const dateRange = sortedDates.length > 0
    ? `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}`
    : '';

  return {
    ok: true,
    actualsCount,
    plansCount,
    plansSkipped,
    plansOverwritten,
    loginCount: loginSet.size,
    dateRange,
    unmappedItems: [...unmapped].sort(),
  };
}

// プレビュー: xlsx を読んで重複日のみ返す (書き込みなし)
export function previewJissekiXlsx(
  xlsxPath: string,
  configDir: string,
): PreviewResult {
  try {
    const buf = fs.readFileSync(xlsxPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['実績蓄積'];
    if (!ws) {
      return { ok: false, filePath: xlsxPath, existingPlanDates: [],
        newPlanDates: [], totalRows: 0, loginCount: 0,
        error: '「実績蓄積」シートが見つかりません' };
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    const dataRows = rows.slice(1).filter((r) => r[9] != null && r[9] !== '');
    const loginSet = new Set<string>();
    const planDateSet = new Set<string>();
    for (const r of dataRows) {
      const dateSerial = r[9];
      if (typeof dateSerial !== 'number') continue;
      const date = excelToISO(dateSerial);
      const login = String(r[10] ?? '').trim();
      if (!login) continue;
      loginSet.add(login);
      const planLhRaw = typeof r[6] === 'number' ? r[6] : null;
      if (planLhRaw != null && planLhRaw !== dateSerial
          && Math.abs(planLhRaw) < 100 && planLhRaw !== 0) {
        planDateSet.add(date);
      }
    }
    const plansDir = path.join(configDir, 'plans');
    const existingPlanDates: string[] = [];
    const newPlanDates: string[] = [];
    for (const d of planDateSet) {
      if (fs.existsSync(path.join(plansDir, `${d}.json`))) {
        existingPlanDates.push(d);
      } else {
        newPlanDates.push(d);
      }
    }
    return {
      ok: true, filePath: xlsxPath,
      existingPlanDates: existingPlanDates.sort(),
      newPlanDates: newPlanDates.sort(),
      totalRows: dataRows.length, loginCount: loginSet.size,
    };
  } catch (e) {
    return { ok: false, filePath: xlsxPath, existingPlanDates: [],
      newPlanDates: [], totalRows: 0, loginCount: 0, error: String(e) };
  }
}
