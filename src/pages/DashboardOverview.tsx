import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichSchichtplan } from '@/lib/enrich';
import type { EnrichedSchichtplan } from '@/types/enriched';
import type { Mitarbeiter, Schichttypen, Schichtplan } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { IconAlertCircle, IconTool, IconRefresh, IconCheck, IconPlus, IconPencil, IconTrash, IconChevronLeft, IconChevronRight, IconCalendar, IconUsers, IconClock, IconBriefcase } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SchichtplanDialog } from '@/components/dialogs/SchichtplanDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, format, isSameDay, parseISO, isToday } from 'date-fns';
import { de } from 'date-fns/locale';

const APPGROUP_ID = '69ef62f5866abee5290dd54d';
const REPAIR_ENDPOINT = '/claude/build/repair';

// Farben für Schichttypen
const SHIFT_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200', dot: 'bg-cyan-500' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200', dot: 'bg-orange-500' },
];

function getShiftColor(schichttypenId: string | null, schichttypenMap: Map<string, Schichttypen>) {
  if (!schichttypenId) return SHIFT_COLORS[0];
  // Nutze farbcode wenn vorhanden
  const typ = schichttypenMap.get(schichttypenId);
  if (typ?.fields.farbcode) {
    // Custom color via inline style
    return null;
  }
  // Fallback: hash-basierte Farbe
  let hash = 0;
  for (let i = 0; i < schichttypenId.length; i++) hash = (hash * 31 + schichttypenId.charCodeAt(i)) % SHIFT_COLORS.length;
  return SHIFT_COLORS[Math.abs(hash) % SHIFT_COLORS.length];
}

function getCustomColor(schichttypenId: string | null, schichttypenMap: Map<string, Schichttypen>): string | null {
  if (!schichttypenId) return null;
  const typ = schichttypenMap.get(schichttypenId);
  return typ?.fields.farbcode ?? null;
}

export default function DashboardOverview() {
  const {
    mitarbeiter, schichttypen, schichtplan,
    mitarbeiterMap, schichttypenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedSchichtplan = enrichSchichtplan(schichtplan, { mitarbeiterMap, schichttypenMap });

  // State — alle Hooks vor early returns!
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { locale: de, weekStartsOn: 1 })
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedSchichtplan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedSchichtplan | null>(null);
  const [selectedMitarbeiter, setSelectedMitarbeiter] = useState<string | 'all'>('all');
  const [prefillDate, setPrefillDate] = useState<string | undefined>(undefined);

  // Wochentage berechnen
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  // Schichtplan der aktuellen Woche filtern
  const weekEnd = useMemo(() => endOfWeek(currentWeekStart, { locale: de, weekStartsOn: 1 }), [currentWeekStart]);

  const weekEntries = useMemo(() => {
    return enrichedSchichtplan.filter(e => {
      if (!e.fields.datum) return false;
      try {
        const d = parseISO(e.fields.datum);
        if (d < currentWeekStart || d > weekEnd) return false;
        if (selectedMitarbeiter !== 'all') {
          const mid = extractRecordId(e.fields.mitarbeiter_auswahl);
          if (mid !== selectedMitarbeiter) return false;
        }
        return true;
      } catch { return false; }
    });
  }, [enrichedSchichtplan, currentWeekStart, weekEnd, selectedMitarbeiter]);

  // Einträge pro Tag gruppieren
  const entriesByDay = useMemo(() => {
    const map = new Map<string, EnrichedSchichtplan[]>();
    weekEntries.forEach(e => {
      const key = e.fields.datum!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [weekEntries]);

  // KPI-Werte
  const totalMitarbeiter = mitarbeiter.length;
  const totalSchichttypen = schichttypen.length;
  const schichtenDieseWoche = weekEntries.length;
  const schichtenGesamt = schichtplan.length;

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const handleCreate = async (fields: Schichtplan['fields']) => {
    await LivingAppsService.createSchichtplanEntry(fields);
    fetchAll();
  };

  const handleUpdate = async (fields: Schichtplan['fields']) => {
    if (!editRecord) return;
    await LivingAppsService.updateSchichtplanEntry(editRecord.record_id, fields);
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await LivingAppsService.deleteSchichtplanEntry(deleteTarget.record_id);
    setDeleteTarget(null);
    fetchAll();
  };

  const openCreateForDay = (dateStr: string) => {
    setEditRecord(null);
    setPrefillDate(dateStr);
    setDialogOpen(true);
  };

  const openEdit = (entry: EnrichedSchichtplan) => {
    setEditRecord(entry);
    setPrefillDate(undefined);
    setDialogOpen(true);
  };

  const prevWeek = () => setCurrentWeekStart(w => subWeeks(w, 1));
  const nextWeek = () => setCurrentWeekStart(w => addWeeks(w, 1));
  const goToday = () => setCurrentWeekStart(startOfWeek(new Date(), { locale: de, weekStartsOn: 1 }));

  const weekLabel = `${format(currentWeekStart, 'd. MMMM', { locale: de })} – ${format(weekEnd, 'd. MMMM yyyy', { locale: de })}`;

  return (
    <div className="space-y-6">
      {/* KPI-Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Mitarbeiter"
          value={String(totalMitarbeiter)}
          description="Gesamt"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Schichttypen"
          value={String(totalSchichttypen)}
          description="Definiert"
          icon={<IconBriefcase size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Schichten"
          value={String(schichtenDieseWoche)}
          description="Diese Woche"
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gesamt"
          value={String(schichtenGesamt)}
          description="Alle Schichten"
          icon={<IconClock size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Wochenplaner */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={prevWeek}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
              aria-label="Vorherige Woche"
            >
              <IconChevronLeft size={18} />
            </button>
            <span className="font-semibold text-sm truncate">{weekLabel}</span>
            <button
              onClick={nextWeek}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
              aria-label="Nächste Woche"
            >
              <IconChevronRight size={18} />
            </button>
            <button
              onClick={goToday}
              className="px-2.5 py-1 text-xs rounded-lg border hover:bg-accent transition-colors shrink-0 font-medium"
            >
              Heute
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mitarbeiter-Filter */}
            <select
              value={selectedMitarbeiter}
              onChange={e => setSelectedMitarbeiter(e.target.value)}
              className="text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Alle Mitarbeiter</option>
              {mitarbeiter.map(m => (
                <option key={m.record_id} value={m.record_id}>
                  {m.fields.vorname} {m.fields.nachname}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => { setEditRecord(null); setPrefillDate(undefined); setDialogOpen(true); }}>
              <IconPlus size={14} className="mr-1 shrink-0" />
              <span className="hidden sm:inline">Schicht hinzufügen</span>
              <span className="sm:hidden">Hinzufügen</span>
            </Button>
          </div>
        </div>

        {/* Kalender-Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Wochentag-Header */}
            <div className="grid grid-cols-7 border-b">
              {weekDays.map(day => {
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-3 text-center border-r last:border-r-0 ${today ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`text-xs font-medium uppercase tracking-wide ${today ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE', { locale: de })}
                    </div>
                    <div className={`text-lg font-bold mt-0.5 leading-none ${today ? 'text-primary' : 'text-foreground'}`}>
                      {format(day, 'd')}
                    </div>
                    {today && <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-1" />}
                  </div>
                );
              })}
            </div>

            {/* Schicht-Slots */}
            <div className="grid grid-cols-7">
              {weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const entries = entriesByDay.get(dateStr) ?? [];
                const today = isToday(day);

                return (
                  <div
                    key={dateStr}
                    className={`min-h-[140px] p-2 border-r last:border-r-0 border-b ${today ? 'bg-primary/[0.02]' : ''}`}
                  >
                    <div className="space-y-1.5">
                      {entries.map(entry => {
                        const stId = extractRecordId(entry.fields.schichttyp_auswahl);
                        const color = getShiftColor(stId, schichttypenMap);
                        const customColor = getCustomColor(stId, schichttypenMap);
                        const schichtTyp = stId ? schichttypenMap.get(stId) : null;

                        return (
                          <div
                            key={entry.record_id}
                            className={`rounded-lg p-1.5 border text-xs group ${color ? `${color.bg} ${color.text} ${color.border}` : 'bg-muted border-border'}`}
                            style={customColor ? { backgroundColor: `${customColor}20`, borderColor: customColor, color: customColor } : undefined}
                          >
                            <div className="flex items-start justify-between gap-1 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate leading-tight">
                                  {entry.mitarbeiter_auswahlName || '—'}
                                </div>
                                <div className="truncate opacity-75 leading-tight mt-0.5">
                                  {entry.schichttyp_auswahlName || '—'}
                                </div>
                                {schichtTyp?.fields.startzeit && schichtTyp.fields.endzeit && (
                                  <div className="opacity-60 leading-tight mt-0.5">
                                    {schichtTyp.fields.startzeit}–{schichtTyp.fields.endzeit}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-0.5 shrink-0">
                                <button
                                  onClick={() => openEdit(entry)}
                                  className="p-0.5 rounded hover:bg-black/10 transition-colors"
                                  aria-label="Bearbeiten"
                                >
                                  <IconPencil size={11} />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(entry)}
                                  className="p-0.5 rounded hover:bg-black/10 transition-colors"
                                  aria-label="Löschen"
                                >
                                  <IconTrash size={11} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Leerer Slot zum Hinzufügen */}
                      <button
                        onClick={() => openCreateForDay(dateStr)}
                        className="w-full flex items-center justify-center gap-1 p-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors text-xs"
                        aria-label={`Schicht am ${formatDate(dateStr)} hinzufügen`}
                      >
                        <IconPlus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Schichttypen-Legende */}
      {schichttypen.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Schichttypen</h3>
          <div className="flex flex-wrap gap-2">
            {schichttypen.map((typ, idx) => {
              const colorIdx = idx % SHIFT_COLORS.length;
              const color = SHIFT_COLORS[colorIdx];
              const custom = typ.fields.farbcode;
              return (
                <div
                  key={typ.record_id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${!custom ? `${color.bg} ${color.text} ${color.border}` : ''}`}
                  style={custom ? { backgroundColor: `${custom}20`, borderColor: custom, color: custom } : undefined}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${!custom ? color.dot : ''}`}
                    style={custom ? { backgroundColor: custom } : undefined}
                  />
                  <span className="truncate max-w-[120px]">{typ.fields.schichtname ?? '—'}</span>
                  {typ.fields.startzeit && typ.fields.endzeit && (
                    <span className="opacity-70">{typ.fields.startzeit}–{typ.fields.endzeit}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialoge */}
      <SchichtplanDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); setPrefillDate(undefined); }}
        onSubmit={async (fields) => {
          if (editRecord) await handleUpdate(fields);
          else await handleCreate(fields);
        }}
        defaultValues={
          editRecord
            ? editRecord.fields
            : prefillDate
            ? { datum: prefillDate }
            : undefined
        }
        mitarbeiterList={mitarbeiter}
        schichttypenList={schichttypen}
        enablePhotoScan={AI_PHOTO_SCAN['Schichtplan']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Schichtplan']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Schicht löschen"
        description={`Schicht von ${deleteTarget?.mitarbeiter_auswahlName ?? '—'} am ${deleteTarget?.fields.datum ? formatDate(deleteTarget.fields.datum) : '—'} wirklich löschen?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-[400px] rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
