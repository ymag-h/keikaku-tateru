export {};

declare global {
  interface Window {
    api: {
      readConfig: (name: string) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: string;
        path?: string;
      }>;
      listMembers: () => Promise<{
        ok: boolean;
        data?: Array<{
          login: string;
          name: string;
          role?: string;
          uph?: Record<string, number>;
        }>;
        error?: string;
        path?: string;
      }>;
      writeConfig: (name: string, data: unknown) => Promise<{
        ok: boolean;
        error?: string;
        path?: string;
      }>;
      writeMembers: (members: unknown[]) => Promise<{
        ok: boolean;
        error?: string;
        path?: string;
      }>;
      writeMembersFile: (payload: unknown) => Promise<{
        ok: boolean;
        error?: string;
        path?: string;
      }>;
      appInfo: () => Promise<{
        version: string;
        isDev: boolean;
        configDir: string;
        platform: string;
        arch: string;
      }>;
      importShiftXlsx: (month: string) => Promise<{
        ok: boolean;
        entries?: Record<string, Record<string, boolean>>;
        sourcePath?: string;
        unresolved?: string[];
        error?: string;
      }>;
      importShiftFile: () => Promise<{
        ok: boolean;
        entries?: Record<string, Record<string, boolean>>;
        sourcePath?: string;
        unresolved?: string[];
        error?: string;
      }>;
      listShiftSheetsFromNW: (month: string) => Promise<{
        ok: boolean;
        sheets?: string[];
        filePath?: string;
        error?: string;
      }>;
      listShiftSheetsFromFile: () => Promise<{
        ok: boolean;
        sheets?: string[];
        filePath?: string;
        error?: string;
      }>;
      parseShiftSheet: (filePath: string, sheetName: string) => Promise<{
        ok: boolean;
        entries?: Record<string, Record<string, boolean>>;
        sourcePath?: string;
        unresolved?: string[];
        error?: string;
      }>;
      readPlan: (date: string) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: string;
        path?: string;
      }>;
      writePlan: (date: string, data: unknown) => Promise<{
        ok: boolean;
        error?: string;
        path?: string;
      }>;
      listPlans: () => Promise<{
        ok: boolean;
        dates?: string[];
        error?: string;
      }>;
      readActual: (login: string, date: string) => Promise<{
        ok: boolean;
        data?: unknown;
        error?: string;
        path?: string;
      }>;
      writeActual: (login: string, date: string, data: unknown) => Promise<{
        ok: boolean;
        error?: string;
        path?: string;
      }>;
      listActualsByDate: (date: string) => Promise<{
        ok: boolean;
        actuals?: Array<{ login: string; data: unknown }>;
        error?: string;
      }>;
      listActualsByRange: (start: string, end: string) => Promise<{
        ok: boolean;
        actuals?: Array<{ login: string; date: string; data: unknown }>;
        error?: string;
      }>;
      importFromXlsx: (opts?: { mode?: string; filePath?: string }) => Promise<{
        ok: boolean;
        // import result
        actualsCount?: number;
        plansCount?: number;
        plansSkipped?: number;
        plansOverwritten?: number;
        loginCount?: number;
        dateRange?: string;
        unmappedItems?: string[];
        // preview result
        filePath?: string;
        existingPlanDates?: string[];
        newPlanDates?: string[];
        totalRows?: number;
        error?: string;
      }>;
      readBoard: () => Promise<{
        ok: boolean;
        posts: Array<{
          id: string;
          author: string;
          body: string;
          ts: string;
        }>;
        error?: string;
      }>;
      writeBoard: (posts: unknown[]) => Promise<{
        ok: boolean;
        error?: string;
      }>;
    };
  }
}
