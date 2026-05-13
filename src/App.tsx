import { useCallback, useEffect, useState } from 'react';
import { SettingsDialog } from './components/SettingsDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { DashboardTab } from './components/DashboardTab';
import { PlansTab } from './components/PlansTab';
import { ActualsInputTab } from './components/ActualsInputTab';
import { ActualsTab } from './components/ActualsTab';
import { ProductivityTab } from './components/ProductivityTab';
import { ShiftsViewTab } from './components/ShiftsViewTab';
import type { Member, MembersFile } from './components/MembersTab';
import type { PlanSlots } from './lib/planUtils';
import type { RoutinesFile } from './components/RoutinesTab';
import type { ShiftsFile } from './components/ShiftsTab';
import type { AppMeta } from './components/settings/GeneralPane';
import type { Role, RolesFile } from './lib/roles';
import { DEFAULT_ROLES, plannedRoles } from './lib/roles';

const FALLBACK_SLOTS: PlanSlots = { QC: 3, Sub: 1 };
const DEFAULT_META: AppMeta = {
  schema_version: '1.1.0',
  team_name: 'keikaku-qc',
  description: 'NRT5 / HND2 QC チーム 計画実績アプリ',
  default_slots: FALLBACK_SLOTS,
};

export default function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES);
  const [planSlots, setPlanSlots] = useState<PlanSlots>(FALLBACK_SLOTS);
  const [routines, setRoutines] = useState<RoutinesFile | null>(null);
  const [shifts, setShifts] = useState<ShiftsFile | null>(null);
  const [meta, setMeta] = useState<AppMeta>(DEFAULT_META);
  const [loaded, setLoaded] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [m, r, mt, rl] = await Promise.all([
        window.api.readConfig('members.json'),
        window.api.readConfig('routines.json'),
        window.api.readConfig('app_meta.json'),
        window.api.readConfig('roles.json'),
      ]);

      // Roles 読込 (fallback: DEFAULT_ROLES)
      let effectiveRoles: Role[] = DEFAULT_ROLES;
      if (rl.ok && rl.data) {
        const rld = rl.data as RolesFile;
        if (Array.isArray(rld.roles) && rld.roles.length > 0) {
          effectiveRoles = rld.roles;
        }
      }
      setRoles(effectiveRoles);

      // Members 読込
      let membersPlanSlots: PlanSlots | undefined;
      if (m.ok && m.data) {
        const md = m.data as MembersFile;
        setMembers(md.members ?? []);
        membersPlanSlots = md.plan_slots;
      }

      // Routines 読込
      if (r.ok && r.data) {
        const rd = r.data as RoutinesFile;
        setRoutines({ ...rd, daily: rd.daily ?? [], weekly: rd.weekly ?? [] });
      }

      // Meta + slot 優先順位: meta.default_slots > members.plan_slots > fallback(planned roles × 1)
      let nextMeta: AppMeta = DEFAULT_META;
      if (mt.ok && mt.data) {
        const md = mt.data as AppMeta;
        nextMeta = {
          schema_version: md.schema_version ?? '1.1.0',
          team_name: md.team_name || DEFAULT_META.team_name,
          description: md.description || DEFAULT_META.description,
          updated_at: md.updated_at,
          default_slots: md.default_slots,
          layout: md.layout,
        };
      }
      setMeta(nextMeta);

      // planSlots 決定
      let slots: PlanSlots;
      if (nextMeta.default_slots && Object.keys(nextMeta.default_slots).length > 0) {
        slots = nextMeta.default_slots;
      } else if (membersPlanSlots && Object.keys(membersPlanSlots).length > 0) {
        slots = membersPlanSlots;
      } else {
        // planned roles 全員 × 1 を fallback
        const fallback: PlanSlots = {};
        for (const rr of plannedRoles(effectiveRoles)) {
          fallback[rr.id] = FALLBACK_SLOTS[rr.id] ?? 1;
        }
        slots = Object.keys(fallback).length > 0 ? fallback : FALLBACK_SLOTS;
      }
      setPlanSlots(slots);

      // 現在月のシフトを読む
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const s = await window.api.readConfig(`shifts/shift_${ym}.json`);
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
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{meta.team_name}</h1>
            <p className="text-[11px] text-muted-foreground">
              {meta.description}
            </p>
          </div>
          <SettingsDialog onMetaChanged={loadAll} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-4">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid grid-cols-6 w-full max-w-4xl mb-4">
            <TabsTrigger value="dashboard">ダッシュボード</TabsTrigger>
            <TabsTrigger value="plans">計画マスタ</TabsTrigger>
            <TabsTrigger value="actuals-input">実績入力</TabsTrigger>
            <TabsTrigger value="distribution">配信用</TabsTrigger>
            <TabsTrigger value="productivity">個人別生産性</TabsTrigger>
            <TabsTrigger value="shifts">シフト</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab members={members} routines={routines} shifts={shifts} planSlots={planSlots} roles={roles} />
          </TabsContent>

          <TabsContent value="plans">
            <PlansTab
              members={members}
              routines={routines}
              shifts={shifts}
              planSlots={planSlots}
              roles={roles}
              meta={meta}
            />
          </TabsContent>

          <TabsContent value="actuals-input">
            <ActualsInputTab
              members={members}
              routines={routines}
              shifts={shifts}
              planSlots={planSlots}
              roles={roles}
            />
          </TabsContent>

          <TabsContent value="distribution">
            <ActualsTab
              members={members}
              routines={routines}
              planSlots={planSlots}
              roles={roles}
              meta={meta}
            />
          </TabsContent>

          <TabsContent value="productivity">
            <ProductivityTab members={members} routines={routines} />
          </TabsContent>

          <TabsContent value="shifts">
            <ShiftsViewTab members={members} initialShifts={shifts} roles={roles} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
