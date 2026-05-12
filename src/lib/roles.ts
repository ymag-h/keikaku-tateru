// Role 定義 (config/roles.json に保存)

export type RoleColor =
  | 'blue'
  | 'purple'
  | 'green'
  | 'amber'
  | 'rose'
  | 'teal'
  | 'indigo'
  | 'slate';

export type RoleColorPreset = {
  id: RoleColor;
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
};

export const ROLE_COLOR_PRESETS: RoleColorPreset[] = [
  { id: 'blue',   label: '青',       bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300',   dot: 'bg-blue-500' },
  { id: 'purple', label: '紫',       bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', dot: 'bg-purple-500' },
  { id: 'green',  label: '緑',       bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300',  dot: 'bg-green-500' },
  { id: 'amber',  label: '琥珀',     bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300',  dot: 'bg-amber-500' },
  { id: 'rose',   label: '赤系',     bg: 'bg-rose-100',   text: 'text-rose-800',   border: 'border-rose-300',   dot: 'bg-rose-500' },
  { id: 'teal',   label: 'ティール', bg: 'bg-teal-100',   text: 'text-teal-800',   border: 'border-teal-300',   dot: 'bg-teal-500' },
  { id: 'indigo', label: '藍',       bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300', dot: 'bg-indigo-500' },
  { id: 'slate',  label: 'グレー',   bg: 'bg-slate-100',  text: 'text-slate-800',  border: 'border-slate-300',  dot: 'bg-slate-500' },
];

export type Role = {
  id: string;
  name: string;
  color: RoleColor;
  show_in_plan: boolean;
  order: number;
};

export type RolesFile = {
  schema_version: string;
  roles: Role[];
};

export const DEFAULT_ROLES: Role[] = [
  { id: 'QC', name: 'QC', color: 'blue', show_in_plan: true, order: 0 },
  { id: 'Sub', name: 'Sub', color: 'purple', show_in_plan: true, order: 1 },
];

export function getRoleColorPreset(color: string): RoleColorPreset {
  return ROLE_COLOR_PRESETS.find((p) => p.id === color) ?? ROLE_COLOR_PRESETS[0];
}

export function findRole(roles: Role[], id: string | undefined): Role | undefined {
  if (!id) return undefined;
  return roles.find((r) => r.id === id);
}

export function sortedRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => a.order - b.order);
}

export function plannedRoles(roles: Role[]): Role[] {
  return sortedRoles(roles).filter((r) => r.show_in_plan);
}

// Role ID バリデーション: 英数字 + _ のみ
export function isValidRoleId(id: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id);
}

// Role パネル用 Tailwind クラスセット (PlansTab / ActualsInputTab / PersonColumn 共用)
export type RolePanelClasses = {
  sectionBorder: string;  // 外枠 (border-{c}-300)
  sectionBg: string;      // 外枠の薄い塗り (bg-{c}-50)
  headBg: string;         // ヘッダー帯 (bg-{c}-100)
  headText: string;       // ヘッダーテキスト (text-{c}-900)
  accentText: string;     // 副次テキスト (text-{c}-700)
  badgeBg: string;        // LHバッジ (bg-{c}-600)
  columnBorder: string;   // PersonColumn 外枠 (border-{c}-300)
  columnHeadBg: string;   // PersonColumn ヘッダー (bg-{c}-100)
  columnHeadText: string; // PersonColumn ヘッダーテキスト (text-{c}-900)
};

export function getRolePanelClasses(color: string): RolePanelClasses {
  const preset = ROLE_COLOR_PRESETS.find((p) => p.id === color) ?? ROLE_COLOR_PRESETS[0];
  const c = preset.id;
  return {
    sectionBorder: `border-${c}-300`,
    sectionBg: `bg-${c}-50`,
    headBg: `bg-${c}-100`,
    headText: `text-${c}-900`,
    accentText: `text-${c}-700`,
    badgeBg: `bg-${c}-600`,
    columnBorder: `border-${c}-300`,
    columnHeadBg: `bg-${c}-100`,
    columnHeadText: `text-${c}-900`,
  };
}
