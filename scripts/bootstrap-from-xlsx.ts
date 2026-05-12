/**
 * 既存の QA計画実績.xlsx から config 4本を生成する一回限りのブートストラップ。
 *
 * 使用例:
 *   bun run bootstrap
 *   または:
 *   bun scripts/bootstrap-from-xlsx.ts input/qa_plan.xlsx input/air_bins.txt config
 *
 * 生成物:
 *   config/members.json
 *   config/routines.json
 *   config/shifts/shift_YYYY-MM.json
 *   config/air_bins.json
 */
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import type { Member, RoutineDef, WeeklyRoutineDef } from '../src/types';

// ---------- CLI 引数 ----------
const [, , xlsxArg, airArg, outArg] = process.argv;
if (!xlsxArg || !outArg) {
  console.error('Usage: bun bootstrap-from-xlsx.ts <xlsx> <air_bins.txt> <outDir>');
  process.exit(1);
}
const XLSX_PATH = resolve(xlsxArg);
const AIR_TXT_PATH = airArg ? resolve(airArg) : null;
const OUT_DIR = resolve(outArg);

// ---------- 共通ヘルパ ----------
function writeJson(path: string, obj: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2), 'utf-8');
  console.log(`  ✓ ${path}`);
}

function toId(name: string): string {
  return name
    .replace(/\s+/g, '_')
    .replace(/[/・,()]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * シート全体を A列から始まる 2D 配列として取得する。
 * sheet_to_json は空の先頭列を自動 skip するため、range を A1 起点に正規化する。
 */
function rowsAlignedToA(ws: XLSX.WorkSheet): any[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  range.s.c = 0;
  range.s.r = 0;
  const newRef = XLSX.utils.encode_range(range);
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, range: newRef });
}

const now = new Date().toISOString();
console.log(`\n▶ reading: ${XLSX_PATH}`);
const buf = readFileSync(XLSX_PATH);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

// name → login map (members 生成後にセット、shifts 生成で参照)
const globalLoginMap = new Map<string, string>();

// ---------- members.json (login シート) ----------
(function buildMembers() {
  const ws = wb.Sheets['login'];
  if (!ws) { console.warn('  ⚠ login シートが見つからず、members スキップ'); return; }
  const raw = rowsAlignedToA(ws);

  // raw[0] = R1 ヘッダ ["name", "login"]
  // raw[1..] = R2 以降: [name, login, null, uph_name, andon, sim, lost, ...]
  //   右テーブルは R2 がヘッダ ["uph", "andon", "SIM", "迷子"]、R3 以降がデータ
  const leftMap = new Map<string, string>();    // name -> login (左: idx 1..)
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] || [];
    const name = r[0]?.toString().trim();
    const login = r[1]?.toString().trim();
    if (name && login) leftMap.set(name, login);
  }

  type UphRow = { name: string; andon: number | null; sim: number | null; lost: number | null };
  const rightList: UphRow[] = [];              // 右テーブル: idx 2..
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i] || [];
    const name = r[3]?.toString().trim();
    if (!name) continue;
    rightList.push({
      name,
      andon: toNum(r[4]),
      sim: toNum(r[5]),
      lost: toNum(r[6]),
    });
  }

  const allNames = new Set<string>([...leftMap.keys(), ...rightList.map(r => r.name)]);
  const members: Member[] = [...allNames].map(name => {
    const uph = rightList.find(r => r.name === name);
    const login = leftMap.get(name) ?? null;
    if (login) globalLoginMap.set(name, login);
    return {
      login,
      name,
      role: 'QC' as const,
      daily_hours: 7.0,
      uph: {
        andon: uph?.andon ?? null,
        sim: uph?.sim ?? null,
        lost: uph?.lost ?? null,
      },
    };
  });

  writeJson(join(OUT_DIR, 'members.json'), {
    schema_version: '1.1.0',
    fc: 'NRT5',
    imported_at: now,
    members,
  });

  const missing = members.filter(m => !m.login).map(m => m.name);
  if (missing.length) {
    console.warn(`  ⚠ login 未設定: ${missing.join(', ')} → 設定画面で補完してください`);
  }
  console.log(`    members=${members.length}`);
})();

// ---------- routines.json (master + 計画 シート) ----------
(function buildRoutines() {
  const SKIP_WORDS = new Set(['合計', '項目', 'A Routine', '計画', '種類', '']);

  // master: N列(idx 13)=項目, O列(idx 14)=必要LH, Q列(idx 16)=Plan LH
  // R4 (idx 3) がヘッダ、R5 (idx 4) 以降がデータ
  const ms = wb.Sheets['master'];
  const daily: RoutineDef[] = [];
  if (ms) {
    const mraw = rowsAlignedToA(ms);
    let order = 1;
    for (let i = 4; i < Math.min(mraw.length, 23); i++) {
      const r = mraw[i] || [];
      const name = r[13];
      if (!name || typeof name !== 'string') continue;
      const trimmed = name.trim();
      if (!trimmed || SKIP_WORDS.has(trimmed)) continue;
      daily.push({
        id: toId(trimmed),
        name: trimmed,
        default_lh: toNum(r[16]) ?? 0,
        order: order++,
      });
    }
  } else { console.warn('  ⚠ master シート無し'); }

  // 計画: B列(idx 1)=種類, F列(idx 5)=Total 必要LH
  // R28 (idx 27) 以降。R28=header、R29 以降がデータ
  const ps = wb.Sheets['計画'];
  const weekly: WeeklyRoutineDef[] = [];
  if (ps) {
    const praw = rowsAlignedToA(ps);
    for (let i = 28; i < praw.length; i++) {
      const r = praw[i] || [];
      const name = r[1];
      if (!name || typeof name !== 'string') continue;
      const trimmed = name.trim();
      if (!trimmed || SKIP_WORDS.has(trimmed)) continue;
      weekly.push({
        id: toId(trimmed),
        name: trimmed,
        default_need: toNum(r[5]) ?? 0,
      });
    }
  } else { console.warn('  ⚠ 計画 シート無し'); }

  writeJson(join(OUT_DIR, 'routines.json'), {
    schema_version: '1.0.0',
    imported_at: now,
    daily,
    weekly,
    design_target_hours_per_day: 7.04,
  });
  console.log(`    daily=${daily.length}, weekly=${weekly.length}`);
})();

// ---------- shifts (シフト シート) ----------
(function buildShifts() {
  const ws = wb.Sheets['シフト'];
  if (!ws) { console.warn('  ⚠ シフト シート無し'); return; }
  const raw = rowsAlignedToA(ws);

  // R6 (idx 5) が日付ヘッダ行。C列 (idx 2)=Name, D列 (idx 3) 以降が日付
  const header = raw[5] || [];
  const dateCols: { col: number; date: string }[] = [];
  for (let c = 3; c < header.length; c++) {
    const v = header[c];
    if (v instanceof Date) {
      dateCols.push({ col: c, date: v.toISOString().slice(0, 10) });
    }
  }
  if (!dateCols.length) { console.warn('  ⚠ 日付ヘッダが見つからず、シフト スキップ'); return; }

  // 出勤判定: 数字で始まる値 ("9", "8.5") = 出勤、それ以外 ("公","有","TYO6"...) = 休
  function isWorkDay(v: unknown): boolean {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return /^\d/.test(s);
  }

  // members.json は苗字のみ ("加藤") / シフトシートはフルネーム ("加藤　虎雅") なので苗字 lookup
  function lookupLogin(name: string): string | null {
    if (globalLoginMap.has(name)) return globalLoginMap.get(name)!;
    const surname = name.split(/[\s　]+/)[0];
    return globalLoginMap.get(surname) ?? null;
  }

  // R7 (idx 7) 以降: B列(idx 1)=Job Title, C列(idx 2)=Name, D列以降=値
  // 新スキーマ: entries[login][date] = boolean
  const entries: Record<string, Record<string, boolean>> = {};
  const unresolved: string[] = [];
  for (let i = 7; i < raw.length; i++) {
    const r = raw[i] || [];
    const name = r[2]?.toString().trim();
    if (!name) continue;
    // シフト表 (上段 20人) の下にある集計表を検出: role 列 (idx 1) が空になったら break
    const role = r[1]?.toString().trim();
    if (!role) continue;
    const login = lookupLogin(name);
    if (!login) {
      unresolved.push(name);
      continue;
    }
    const rec: Record<string, boolean> = {};
    for (const { col, date } of dateCols) {
      rec[date] = isWorkDay(r[col]);
    }
    entries[login] = rec;
  }

  // 最頻月を採用 (月またぎの場合、少数派の月日付は無視される設計)
  const monthCounts = new Map<string, number>();
  for (const { date } of dateCols) {
    const m = date.slice(0, 7);
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }
  const ym = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  writeJson(join(OUT_DIR, 'shifts', `shift_${ym}.json`), {
    schema_version: '2.0.0',
    month: ym,
    imported_at: now,
    updated_at: now,
    entries,
  });
  console.log(`    members=${Object.keys(entries).length}, days=${dateCols.length}, ym=${ym}`);
  if (unresolved.length) {
    console.warn(`  ⚠ login 未解決でシフトskip: ${unresolved.join(', ')}`);
  }
})();

// ---------- air_bins.json (txt → json) ----------
(function buildAirBins() {
  const target = join(OUT_DIR, 'air_bins.json');
  if (AIR_TXT_PATH && existsSync(AIR_TXT_PATH)) {
    const txt = readFileSync(AIR_TXT_PATH, 'utf-8');
    // コメント行 (# で始まる) と空行は除外
    const bins = txt
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
    writeJson(target, { schema_version: '1.0.0', imported_at: now, bins });
    console.log(`    bins=${bins.length}`);
  } else {
    console.warn(`  ⚠ ${AIR_TXT_PATH ?? 'air_bins.txt'} 見つからず、空で生成`);
    writeJson(target, { schema_version: '1.0.0', imported_at: now, bins: [] });
  }
})();

console.log('\n✅ bootstrap 完了\n');
