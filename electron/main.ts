import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { importJissekiXlsx, previewJissekiXlsx } from './importActuals';

// NW 共有フォルダ (シフト表)
const NW_SHIFT_DIR = '\\\\ant\\dept-as\\NRT5\\Operations\\ICQA\\11_Shift';

const isDev = !app.isPackaged;
const VITE_DEV_URL = 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'keikaku-qc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function resolveConfigDir(): string {
  if (isDev) {
    return path.join(process.cwd(), 'config');
  }
  return path.join(path.dirname(app.getPath('exe')), 'config');
}

ipcMain.handle('config:read', async (_evt, name: string) => {
  const configDir = resolveConfigDir();
  const filePath = path.join(configDir, name);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `not found: ${filePath}` };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return { ok: true, data: JSON.parse(content), path: filePath };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${filePath}` };
  }
});

ipcMain.handle('config:listMembers', async () => {
  const configDir = resolveConfigDir();
  const filePath = path.join(configDir, 'members.json');
  if (!fs.existsSync(filePath)) return { ok: false, error: `not found: ${filePath}` };
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(content);
  const data = Array.isArray(parsed) ? parsed : (parsed.members ?? []);
  return { ok: true, data, path: filePath };
});

ipcMain.handle('config:write', async (_evt, name: string, data: unknown) => {
  const configDir = resolveConfigDir();
  const filePath = path.join(configDir, name);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('config:writeMembers', async (_evt, members: unknown[]) => {
  const configDir = resolveConfigDir();
  const filePath = path.join(configDir, 'members.json');
  try {
    let wrapper: Record<string, unknown> = {};
    if (fs.existsSync(filePath)) {
      wrapper = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    wrapper.members = members;
    wrapper.updated_at = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// members.json 全体上書き (plan_slots 等含む)
ipcMain.handle('config:writeMembersFile', async (_evt, payload: Record<string, unknown>) => {
  const configDir = resolveConfigDir();
  const filePath = path.join(configDir, 'members.json');
  try {
    const merged = { ...(payload ?? {}), updated_at: new Date().toISOString() };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 計画 (DailyPlan) IPC
ipcMain.handle('plans:read', async (_evt, date: string) => {
  const filePath = path.join(resolveConfigDir(), 'plans', `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `not found: ${filePath}` };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { ok: true, data: JSON.parse(content), path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('plans:write', async (_evt, date: string, data: unknown) => {
  const filePath = path.join(resolveConfigDir(), 'plans', `${date}.json`);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('plans:list', async () => {
  const dir = path.join(resolveConfigDir(), 'plans');
  if (!fs.existsSync(dir)) return { ok: true, dates: [] };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  return { ok: true, dates: files.sort() };
});

// 実績 (UserActual) IPC
ipcMain.handle('actuals:read', async (_evt, login: string, date: string) => {
  const filePath = path.join(resolveConfigDir(), 'actuals', login, `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `not found: ${filePath}` };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { ok: true, data: JSON.parse(content), path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('actuals:write', async (_evt, login: string, date: string, data: unknown) => {
  const filePath = path.join(resolveConfigDir(), 'actuals', login, `${date}.json`);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('actuals:listByDate', async (_evt, date: string) => {
  const actualsDir = path.join(resolveConfigDir(), 'actuals');
  if (!fs.existsSync(actualsDir)) return { ok: true, actuals: [] };
  const logins = fs.readdirSync(actualsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const result: Array<{ login: string; data: unknown }> = [];
  for (const login of logins) {
    const filePath = path.join(actualsDir, login, `${date}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      result.push({ login, data: JSON.parse(content) });
    } catch {
      continue;
    }
  }
  return { ok: true, actuals: result };
});

// 期間内 全login分の actuals を読む (個人別生産性タブ用)
ipcMain.handle(
  'actuals:listByRange',
  async (_evt, startDate: string, endDate: string) => {
    const actualsDir = path.join(resolveConfigDir(), 'actuals');
    if (!fs.existsSync(actualsDir)) return { ok: true, actuals: [] };
    const logins = fs
      .readdirSync(actualsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const result: Array<{ login: string; date: string; data: unknown }> = [];
    for (const login of logins) {
      const dir = path.join(actualsDir, login);
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
      for (const date of files) {
        if (date < startDate || date > endDate) continue;
        const filePath = path.join(dir, `${date}.json`);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          result.push({ login, date, data: JSON.parse(content) });
        } catch {
          continue;
        }
      }
    }
    return { ok: true, actuals: result };
  },
);

ipcMain.handle('app:info', async () => {
  return {
    version: app.getVersion(),
    isDev,
    configDir: resolveConfigDir(),
    platform: process.platform,
    arch: process.arch,
  };
});

// シフト xlsx パース共通ロジック
type ShiftImportResult = {
  ok: boolean;
  entries?: Record<string, Record<string, boolean>>;
  sourcePath?: string;
  unresolved?: string[];
  error?: string;
};

function parseShiftXlsx(filePath: string, sheetName: string = 'シフト'): ShiftImportResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `見つかりません: ${filePath}` };
    }

    // members.json から name -> login map 構築
    const membersPath = path.join(resolveConfigDir(), 'members.json');
    if (!fs.existsSync(membersPath)) {
      return { ok: false, error: 'members.json がありません' };
    }
    const membersRaw = JSON.parse(fs.readFileSync(membersPath, 'utf8'));
    const nameToLogin = new Map<string, string>();
    for (const mem of membersRaw.members ?? []) {
      if (mem.login && mem.name) nameToLogin.set(mem.name, mem.login);
    }
    if (nameToLogin.size === 0) {
      return { ok: false, error: 'members にlogin未設定' };
    }

    // xlsx パース
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[sheetName];
    if (!ws) return { ok: false, error: `シート「${sheetName}」が見つかりません` };

    const ref = ws['!ref'];
    if (!ref) return { ok: false, error: 'シート空' };
    const range = XLSX.utils.decode_range(ref);
    range.s.c = 0;
    range.s.r = 0;
    const newRef = XLSX.utils.encode_range(range);
    const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, range: newRef });

    // R6 (idx 5) が日付ヘッダ行
    const header = raw[5] || [];
    const dateCols: { col: number; date: string }[] = [];
    for (let c = 3; c < header.length; c++) {
      const v = header[c];
      if (v instanceof Date) {
        dateCols.push({ col: c, date: v.toISOString().slice(0, 10) });
      }
    }
    if (!dateCols.length) return { ok: false, error: '日付ヘッダ検出失敗' };

    // 休み判定: 空欄 or 「有」/「公」で始まる文字列 (「有休」「公休」「有給」等を含む)
    // それ以外の非空セル (勤務時間 9:00 / シフトコード A/S/早 等) は出勤扱い
    const isOffDay = (v: unknown): boolean => {
      if (v == null) return true;
      const s = String(v).trim();
      if (s === '') return true;
      return /^[有公]/.test(s);
    };
    const isWorkDay = (v: unknown): boolean => !isOffDay(v);

    const lookupLogin = (name: string): string | null => {
      if (nameToLogin.has(name)) return nameToLogin.get(name)!;
      const surname = name.split(/[\s　]+/)[0];
      return nameToLogin.get(surname) ?? null;
    };

    const entries: Record<string, Record<string, boolean>> = {};
    const unresolved: string[] = [];
    for (let i = 7; i < raw.length; i++) {
      const r = raw[i] || [];
      const name = r[2]?.toString().trim();
      if (!name) continue;
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

    return {
      ok: true,
      entries,
      sourcePath: filePath,
      unresolved,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// NW 共有 xlsx からシフトを読み込む
ipcMain.handle('shifts:importFromXlsx', async (_evt, month: string) => {
  const [y, m] = month.split('-').map(Number);
  const ymShort = `${y}${String(m).padStart(2, '0')}`;
  const nwPath = path.join(NW_SHIFT_DIR, `nrt5_icqa_shift_${ymShort}.xlsx`);
  return parseShiftXlsx(nwPath);
});

// ローカルファイルからシフトを読み込む (ファイル選択ダイアログ)
ipcMain.handle('shifts:importFromFile', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win!, {
      title: 'シフト xlsx を選択',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'キャンセルされました' };
    }
    return parseShiftXlsx(result.filePaths[0]);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ---- シート選択2段階 ----
// シート名一覧のみ返す (ファイルパス指定)
function listSheetsFromXlsx(filePath: string): {
  ok: boolean;
  sheets?: string[];
  filePath?: string;
  error?: string;
} {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `見つかりません: ${filePath}` };
    }
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    return { ok: true, sheets: wb.SheetNames, filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// NW 共有 xlsx のシート一覧
ipcMain.handle('shifts:listSheetsFromNW', async (_evt, month: string) => {
  const [y, m] = month.split('-').map(Number);
  const ymShort = `${y}${String(m).padStart(2, '0')}`;
  const nwPath = path.join(NW_SHIFT_DIR, `nrt5_icqa_shift_${ymShort}.xlsx`);
  return listSheetsFromXlsx(nwPath);
});

// ローカルファイル選択ダイアログ → シート一覧
ipcMain.handle('shifts:listSheetsFromFile', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win!, {
      title: 'シフト xlsx を選択',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'キャンセルされました' };
    }
    return listSheetsFromXlsx(result.filePaths[0]);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// シート指定 parse
ipcMain.handle(
  'shifts:parseSheet',
  async (_evt, filePath: string, sheetName: string) => {
    return parseShiftXlsx(filePath, sheetName);
  },
);


// ========== 実績インポート ==========
ipcMain.handle('import:fromXlsx', async (_e, opts?: { mode?: string; filePath?: string }) => {
  try {
    const mode = (opts?.mode ?? 'merge') as 'merge' | 'overwrite' | 'preview';
    let filePath = opts?.filePath;
    if (!filePath) {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win!, {
        title: '実績蓄積 xlsx / xlsm を選択',
        properties: ['openFile'],
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'キャンセルされました' };
      }
      filePath = result.filePaths[0];
    }
    const cfgDir = resolveConfigDir();
    if (mode === 'preview') {
      return previewJissekiXlsx(filePath, cfgDir);
    }
    return importJissekiXlsx(filePath, cfgDir, mode === 'overwrite');
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});


// ========== 簡易掲示板 ==========
ipcMain.handle('board:read', async () => {
  const filePath = path.join(resolveConfigDir(), 'board.json');
  if (!fs.existsSync(filePath)) return { ok: true, posts: [] };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, posts: data.posts ?? [] };
  } catch (e) {
    return { ok: false, error: String(e), posts: [] };
  }
});

ipcMain.handle('board:write', async (_evt, posts: unknown[]) => {
  const filePath = path.join(resolveConfigDir(), 'board.json');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ posts }, null, 2) + '\n', 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
