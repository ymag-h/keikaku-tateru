import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  readConfig: (name: string) => ipcRenderer.invoke('config:read', name),
  listMembers: () => ipcRenderer.invoke('config:listMembers'),
  writeConfig: (name: string, data: unknown) => ipcRenderer.invoke('config:write', name, data),
  writeMembers: (members: unknown[]) => ipcRenderer.invoke('config:writeMembers', members),
  writeMembersFile: (payload: unknown) => ipcRenderer.invoke('config:writeMembersFile', payload),
  appInfo: () => ipcRenderer.invoke('app:info'),
  importShiftXlsx: (month: string) => ipcRenderer.invoke('shifts:importFromXlsx', month),
  importShiftFile: () => ipcRenderer.invoke('shifts:importFromFile'),
  listShiftSheetsFromNW: (month: string) => ipcRenderer.invoke('shifts:listSheetsFromNW', month),
  listShiftSheetsFromFile: () => ipcRenderer.invoke('shifts:listSheetsFromFile'),
  parseShiftSheet: (filePath: string, sheetName: string) =>
    ipcRenderer.invoke('shifts:parseSheet', filePath, sheetName),
  readPlan: (date: string) => ipcRenderer.invoke('plans:read', date),
  writePlan: (date: string, data: unknown) => ipcRenderer.invoke('plans:write', date, data),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  readActual: (login: string, date: string) => ipcRenderer.invoke('actuals:read', login, date),
  writeActual: (login: string, date: string, data: unknown) =>
    ipcRenderer.invoke('actuals:write', login, date, data),
  listActualsByDate: (date: string) => ipcRenderer.invoke('actuals:listByDate', date),
  listActualsByRange: (start: string, end: string) =>
    ipcRenderer.invoke('actuals:listByRange', start, end),
  importFromXlsx: (opts?: { mode?: string; filePath?: string }) => ipcRenderer.invoke('import:fromXlsx', opts),
  readBoard: () => ipcRenderer.invoke('board:read'),
  writeBoard: (posts: unknown[]) => ipcRenderer.invoke('board:write', posts),
});
