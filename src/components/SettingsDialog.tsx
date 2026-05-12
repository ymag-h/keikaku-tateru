import { useCallback, useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Users,
  ListChecks,
  Calendar,
  Wind,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MembersTab, type MembersFile } from './MembersTab';
import { RoutinesTab, type RoutinesFile } from './RoutinesTab';
import { ShiftsTab, type ShiftsFile } from './ShiftsTab';
import { AirBinsTab } from './AirBinsTab';
import { GeneralPane, type AppMeta } from './settings/GeneralPane';
import { RolesPane } from './settings/RolesPane';
import type { Role, RolesFile } from '@/lib/roles';
import { DEFAULT_ROLES } from '@/lib/roles';

type PaneId = 'general' | 'roles' | 'members' | 'routines' | 'shifts' | 'air_bins';

type Props = {
  onMetaChanged?: () => void;
};

export function SettingsDialog({ onMetaChanged }: Props = {}) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<PaneId>('general');
  const [members, setMembers] = useState<MembersFile | null>(null);
  const [routines, setRoutines] = useState<RoutinesFile | null>(null);
  const [shifts, setShifts] = useState<ShiftsFile | null>(null);
  const [airBins, setAirBins] = useState<string[] | null>(null);
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [m, r, s, a, mt, rl] = await Promise.all([
        window.api.readConfig('members.json'),
        window.api.readConfig('routines.json'),
        window.api.readConfig(`shifts/shift_${ym}.json`),
        window.api.readConfig('air_bins.json'),
        window.api.readConfig('app_meta.json'),
        window.api.readConfig('roles.json'),
      ]);

      if (rl.ok && rl.data) {
        const rld = rl.data as RolesFile;
        if (Array.isArray(rld.roles) && rld.roles.length > 0) {
          setRoles(rld.roles);
        } else {
          setRoles(DEFAULT_ROLES);
        }
      } else {
        setRoles(DEFAULT_ROLES);
      }

      if (m.ok && m.data) {
        const md = m.data as MembersFile;
        setMembers({
          schema_version: md.schema_version,
          fc: md.fc,
          imported_at: md.imported_at,
          updated_at: md.updated_at,
          plan_slots: md.plan_slots ?? { QC: 3, Sub: 1 },
          members: md.members ?? [],
        });
      }
      if (r.ok && r.data) {
        const rd = r.data as RoutinesFile;
        setRoutines({
          ...rd,
          daily: rd.daily ?? [],
          weekly: rd.weekly ?? [],
        });
      }
      if (s.ok && s.data) {
        const sd = s.data as ShiftsFile;
        setShifts({
          schema_version: sd.schema_version ?? '2.0.0',
          month: sd.month ?? ym,
          imported_at: sd.imported_at,
          updated_at: sd.updated_at,
          entries: sd.entries ?? {},
        });
      }
      if (a.ok && a.data) {
        const ad = a.data as { bins?: string[] } | string[];
        setAirBins(Array.isArray(ad) ? ad : ad.bins ?? []);
      }
      if (mt.ok && mt.data) {
        setMeta(mt.data as AppMeta);
      } else {
        setMeta({
          schema_version: '1.0.0',
          team_name: 'keikaku-qc',
          description: 'NRT5 / HND2 QC チーム 計画実績アプリ',
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadAll();
  }, [open, loadAll]);

  const items: Array<{ id: PaneId; label: string; count: number | null; icon: React.ReactNode }> = [
    {
      id: 'general',
      label: 'General',
      count: null,
      icon: <SlidersHorizontal className="h-4 w-4" />,
    },
    {
      id: 'roles',
      label: 'Roles',
      count: roles.length,
      icon: <Tag className="h-4 w-4" />,
    },
    {
      id: 'members',
      label: 'Members',
      count: members?.members?.length ?? 0,
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: 'routines',
      label: 'Routines',
      count: (routines?.daily?.length ?? 0) + (routines?.weekly?.length ?? 0),
      icon: <ListChecks className="h-4 w-4" />,
    },
    {
      id: 'shifts',
      label: 'Shifts',
      count: Object.keys(shifts?.entries ?? {}).length,
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      id: 'air_bins',
      label: 'Air Bins',
      count: airBins?.length ?? 0,
      icon: <Wind className="h-4 w-4" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SettingsIcon className="h-4 w-4" />
          設定
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>共有フォルダの config/ を読み書きします</DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>
        )}

        <div className="grid grid-cols-[180px_1fr] gap-4 flex-1 overflow-hidden">
          {/* ---- 左サイドバー ---- */}
          <nav className="flex flex-col gap-1 overflow-y-auto border-r border-slate-200 pr-2">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setPane(it.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  pane === it.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.count !== null && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-mono',
                      pane === it.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {it.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* ---- 右ペイン ---- */}
          <div className="flex-1 overflow-auto">
            {pane === 'general' && (
              <GeneralPane
                meta={meta}
                members={members?.members ?? []}
                roles={roles}
                onSaved={() => {
                  loadAll();
                  onMetaChanged?.();
                }}
              />
            )}
            {pane === 'roles' && (
              <RolesPane
                initial={{ schema_version: '1.1.0', roles }}
                members={members?.members ?? []}
                onSaved={() => {
                  loadAll();
                  onMetaChanged?.();
                }}
              />
            )}
            {pane === 'members' && (
              <MembersTab initial={members} roles={roles} onSaved={loadAll} />
            )}
            {pane === 'routines' && (
              <RoutinesTab initial={routines} roles={roles} onSaved={loadAll} />
            )}
            {pane === 'shifts' && (
              <ShiftsTab
                initial={shifts}
                members={members?.members ?? null}
                roles={roles}
                onSaved={loadAll}
              />
            )}
            {pane === 'air_bins' && <AirBinsTab airBins={airBins} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
