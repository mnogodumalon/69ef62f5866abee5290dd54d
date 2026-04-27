import { useState, useEffect, useCallback } from 'react';
import { startOfWeek, addDays, format, isSameWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Mitarbeiter, Schichttypen, Schichtplan } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { MitarbeiterDialog } from '@/components/dialogs/MitarbeiterDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  IconCalendar,
  IconUsers,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconLoader2,
  IconCheck,
} from '@tabler/icons-react';

// ─── Types ───────────────────────────────────────────────────────────────────

// Key for the shift assignment grid: "mitarbeiterId_YYYY-MM-DD"
type GridKey = string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startStr = format(weekStart, 'EEE d. MMM', { locale: de });
  const endStr = format(weekEnd, 'EEE d. MMM yyyy', { locale: de });
  return `${startStr} – ${endStr}`;
}

function gridKey(mitarbeiterId: string, dateStr: string): GridKey {
  return `${mitarbeiterId}_${dateStr}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WochenplanPage() {
  // ── Wizard state ──
  const [currentStep, setCurrentStep] = useState(1);

  // ── Step 1: Week selection ──
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );

  // ── Step 2: Employee selection ──
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [selectedMitarbeiterIds, setSelectedMitarbeiterIds] = useState<Set<string>>(new Set());
  const [mitarbeiterDialogOpen, setMitarbeiterDialogOpen] = useState(false);
  const [loadingMitarbeiter, setLoadingMitarbeiter] = useState(false);
  const [mitarbeiterError, setMitarbeiterError] = useState<Error | null>(null);

  // ── Step 3: Shift assignment ──
  const [schichttypen, setSchichttypen] = useState<Schichttypen[]>([]);
  const [existingSchichtplan, setExistingSchichtplan] = useState<Schichtplan[]>([]);
  // grid: key -> schichttypId or '' (no shift)
  const [shiftGrid, setShiftGrid] = useState<Record<GridKey, string>>({});
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [shiftsError, setShiftsError] = useState<Error | null>(null);

  // ── Step 4: Save results ──
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    created: number;
    updated: number;
    deleted: number;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Load employees on mount ──
  const loadMitarbeiter = useCallback(async () => {
    setLoadingMitarbeiter(true);
    setMitarbeiterError(null);
    try {
      const data = await LivingAppsService.getMitarbeiter();
      setMitarbeiter(data);
    } catch (e) {
      setMitarbeiterError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingMitarbeiter(false);
    }
  }, []);

  useEffect(() => {
    loadMitarbeiter();
  }, [loadMitarbeiter]);

  // ── Load shift types + existing schedule when entering step 3 ──
  const loadShiftData = useCallback(async () => {
    setLoadingShifts(true);
    setShiftsError(null);
    try {
      const [typen, plan] = await Promise.all([
        LivingAppsService.getSchichttypen(),
        LivingAppsService.getSchichtplan(),
      ]);
      setSchichttypen(typen);
      setExistingSchichtplan(plan);

      // Pre-fill grid from existing plan entries for the selected week
      const weekDays = getWeekDays(selectedWeekStart);
      const weekDateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'));

      const initialGrid: Record<GridKey, string> = {};
      // Initialize all cells for selected employees as empty
      for (const mid of selectedMitarbeiterIds) {
        for (const dateStr of weekDateStrings) {
          initialGrid[gridKey(mid, dateStr)] = '';
        }
      }
      // Overwrite with existing entries
      for (const entry of plan) {
        const mid = extractRecordId(entry.fields.mitarbeiter_auswahl);
        const dateStr = entry.fields.datum;
        if (!mid || !dateStr) continue;
        if (!selectedMitarbeiterIds.has(mid)) continue;
        if (!weekDateStrings.includes(dateStr)) continue;
        const stid = extractRecordId(entry.fields.schichttyp_auswahl);
        initialGrid[gridKey(mid, dateStr)] = stid ?? '';
      }
      setShiftGrid(initialGrid);
    } catch (e) {
      setShiftsError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingShifts(false);
    }
  }, [selectedWeekStart, selectedMitarbeiterIds]);

  useEffect(() => {
    if (currentStep === 3) {
      loadShiftData();
    }
  }, [currentStep, loadShiftData]);

  // ── Derived values ──
  const weekDays = getWeekDays(selectedWeekStart);
  const weekDateStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'));
  const selectedMitarbeiterList = mitarbeiter.filter(m =>
    selectedMitarbeiterIds.has(m.record_id)
  );

  const totalCells = selectedMitarbeiterIds.size * 7;
  const filledCells = Object.values(shiftGrid).filter(v => v !== '').length;

  // ─── Handlers ────────────────────────────────────────────────────────────

  function handleWeekBack() {
    setSelectedWeekStart(prev => addDays(prev, -7));
  }

  function handleWeekForward() {
    setSelectedWeekStart(prev => addDays(prev, 7));
  }

  function handleSelectAll() {
    setSelectedMitarbeiterIds(new Set(mitarbeiter.map(m => m.record_id)));
  }

  function handleSelectNone() {
    setSelectedMitarbeiterIds(new Set());
  }

  function handleToggleMitarbeiter(id: string) {
    setSelectedMitarbeiterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleShiftChange(mitarbeiterId: string, dateStr: string, schichttypId: string) {
    setShiftGrid(prev => ({
      ...prev,
      [gridKey(mitarbeiterId, dateStr)]: schichttypId,
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    setCurrentStep(4);

    let created = 0;
    let updated = 0;
    let deleted = 0;

    try {
      for (const mid of selectedMitarbeiterIds) {
        for (const dateStr of weekDateStrings) {
          const key = gridKey(mid, dateStr);
          const chosenSchichttypId = shiftGrid[key] ?? '';

          // Find existing entry for this employee+date
          const existing = existingSchichtplan.find(r => {
            const eid = extractRecordId(r.fields.mitarbeiter_auswahl);
            return eid === mid && r.fields.datum === dateStr;
          });

          if (chosenSchichttypId !== '') {
            // We want to set a shift
            if (existing) {
              // Update if different
              const existingStid = extractRecordId(existing.fields.schichttyp_auswahl);
              if (existingStid !== chosenSchichttypId) {
                await LivingAppsService.updateSchichtplanEntry(existing.record_id, {
                  datum: dateStr,
                  mitarbeiter_auswahl: createRecordUrl(APP_IDS.MITARBEITER, mid),
                  schichttyp_auswahl: createRecordUrl(APP_IDS.SCHICHTTYPEN, chosenSchichttypId),
                });
                updated++;
              }
            } else {
              // Create new
              await LivingAppsService.createSchichtplanEntry({
                datum: dateStr,
                mitarbeiter_auswahl: createRecordUrl(APP_IDS.MITARBEITER, mid),
                schichttyp_auswahl: createRecordUrl(APP_IDS.SCHICHTTYPEN, chosenSchichttypId),
              });
              created++;
            }
          } else {
            // No shift selected — delete if existing
            if (existing) {
              await LivingAppsService.deleteSchichtplanEntry(existing.record_id);
              deleted++;
            }
          }
        }
      }
      setSaveResult({ created, updated, deleted });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCurrentStep(1);
    setSelectedWeekStart(getWeekStart(new Date()));
    setSelectedMitarbeiterIds(new Set());
    setShiftGrid({});
    setSaveResult(null);
    setSaveError(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const isCurrentWeek = isSameWeek(selectedWeekStart, new Date(), { weekStartsOn: 1 });

  const steps = [
    { label: 'Woche wählen' },
    { label: 'Mitarbeiter' },
    { label: 'Schichten zuweisen' },
    { label: 'Zusammenfassung' },
  ];

  return (
    <IntentWizardShell
      title="Wochenplan erstellen"
      subtitle="Erstelle den Schichtplan für eine komplette Woche"
      steps={steps}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={false}
      error={null}
    >
      {/* ── Step 1: Week selection ── */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 space-y-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IconCalendar size={18} />
              <span className="text-sm font-medium">Woche auswählen</span>
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handleWeekBack}
                aria-label="Vorherige Woche"
              >
                <IconChevronLeft size={18} />
              </Button>

              <div className="text-center min-w-[240px]">
                <p className="text-xl font-semibold">{formatWeekRange(selectedWeekStart)}</p>
                {isCurrentWeek && (
                  <span className="inline-block mt-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Aktuelle Woche
                  </span>
                )}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={handleWeekForward}
                aria-label="Nächste Woche"
              >
                <IconChevronRight size={18} />
              </Button>
            </div>

            {/* Week day preview */}
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center p-2 rounded-lg bg-muted/40 text-center"
                >
                  <span className="text-xs text-muted-foreground font-medium">
                    {format(day, 'EEE', { locale: de })}
                  </span>
                  <span className="text-sm font-semibold mt-0.5">
                    {format(day, 'd')}
                  </span>
                </div>
              ))}
            </div>

            {!isCurrentWeek && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setSelectedWeekStart(getWeekStart(new Date()))}
                >
                  Zurück zur aktuellen Woche
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="lg" onClick={() => setCurrentStep(2)}>
              Weiter
              <IconChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Employee selection ── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Header info */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IconUsers size={18} />
              <span className="text-sm font-medium">
                Mitarbeiter für <strong className="text-foreground">{formatWeekRange(selectedWeekStart)}</strong> auswählen
              </span>
            </div>
            <span className="text-sm font-semibold text-primary">
              {selectedMitarbeiterIds.size} ausgewählt
            </span>
          </div>

          {/* Select all / none */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Alle auswählen
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectNone}>
              Keine
            </Button>
          </div>

          {/* Error state */}
          {mitarbeiterError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Fehler beim Laden der Mitarbeiter: {mitarbeiterError.message}
              <Button variant="ghost" size="sm" className="ml-2" onClick={loadMitarbeiter}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Loading state */}
          {loadingMitarbeiter && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <IconLoader2 size={20} className="animate-spin" />
              <span className="text-sm">Mitarbeiter werden geladen...</span>
            </div>
          )}

          {/* Employee list */}
          {!loadingMitarbeiter && !mitarbeiterError && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {mitarbeiter.length === 0 && (
                <div className="col-span-2 text-center py-12 text-muted-foreground text-sm">
                  Noch keine Mitarbeiter vorhanden. Erstelle deinen ersten Mitarbeiter.
                </div>
              )}
              {mitarbeiter.map(m => {
                const isSelected = selectedMitarbeiterIds.has(m.record_id);
                return (
                  <button
                    key={m.record_id}
                    type="button"
                    onClick={() => handleToggleMitarbeiter(m.record_id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors w-full ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleMitarbeiter(m.record_id)}
                      onClick={e => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {[m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'}
                      </p>
                      {m.fields.position && (
                        <p className="text-xs text-muted-foreground truncate">{m.fields.position}</p>
                      )}
                      {m.fields.personalnummer && (
                        <p className="text-xs text-muted-foreground truncate">Nr. {m.fields.personalnummer}</p>
                      )}
                    </div>
                    {isSelected && (
                      <IconCheck size={16} className="text-primary ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* New employee button */}
          <Button
            variant="outline"
            onClick={() => setMitarbeiterDialogOpen(true)}
            className="w-full"
          >
            <IconPlus size={16} className="mr-2" />
            Neuen Mitarbeiter anlegen
          </Button>

          <MitarbeiterDialog
            open={mitarbeiterDialogOpen}
            onClose={() => setMitarbeiterDialogOpen(false)}
            onSubmit={async fields => {
              await LivingAppsService.createMitarbeiterEntry(fields);
              await loadMitarbeiter();
            }}
            enablePhotoScan={AI_PHOTO_SCAN['Mitarbeiter']}
            enablePhotoLocation={AI_PHOTO_LOCATION['Mitarbeiter']}
          />

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <IconChevronLeft size={16} className="mr-1" />
              Zurück
            </Button>
            <Button
              size="lg"
              onClick={() => setCurrentStep(3)}
              disabled={selectedMitarbeiterIds.size === 0}
            >
              Weiter ({selectedMitarbeiterIds.size} Mitarbeiter)
              <IconChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Shift assignment ── */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {/* Live progress — sticky header */}
          <div className="sticky top-0 z-10 rounded-xl border bg-card/95 backdrop-blur-sm p-3 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Schichten vergeben</span>
              <span className="font-semibold">
                <span className={filledCells === totalCells ? 'text-green-600' : 'text-primary'}>
                  {filledCells}
                </span>
                <span className="text-muted-foreground"> / {totalCells}</span>
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  filledCells === totalCells ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: totalCells > 0 ? `${(filledCells / totalCells) * 100}%` : '0%' }}
              />
            </div>
            {/* Per-employee status badges */}
            <div className="flex flex-wrap gap-1.5">
              {selectedMitarbeiterList.map(m => {
                const hasShift = weekDateStrings.some(
                  dateStr => (shiftGrid[gridKey(m.record_id, dateStr)] ?? '') !== ''
                );
                return (
                  <span
                    key={m.record_id}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      hasShift
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {hasShift && <IconCheck size={10} stroke={3} />}
                    {[m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Error / loading */}
          {shiftsError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Fehler beim Laden der Schichtdaten: {shiftsError.message}
              <Button variant="ghost" size="sm" className="ml-2" onClick={loadShiftData}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {loadingShifts && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <IconLoader2 size={20} className="animate-spin" />
              <span className="text-sm">Schichtdaten werden geladen...</span>
            </div>
          )}

          {/* Shift grid table */}
          {!loadingShifts && !shiftsError && (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-3 font-medium text-muted-foreground min-w-[140px] sticky left-0 bg-muted/40">
                      Mitarbeiter
                    </th>
                    {weekDays.map((day, i) => (
                      <th
                        key={i}
                        className="text-center p-2 font-medium text-muted-foreground min-w-[120px]"
                      >
                        <div>{format(day, 'EEE', { locale: de })}</div>
                        <div className="text-xs font-normal">{format(day, 'd. MMM', { locale: de })}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedMitarbeiterList.map((m, rowIdx) => (
                    <tr
                      key={m.record_id}
                      className={`border-b last:border-0 ${rowIdx % 2 === 0 ? '' : 'bg-muted/20'}`}
                    >
                      <td className={`p-3 min-w-[140px] sticky left-0 ${rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}>
                        <div className="font-medium truncate">
                          {[m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'}
                        </div>
                        {m.fields.position && (
                          <div className="text-xs text-muted-foreground truncate">{m.fields.position}</div>
                        )}
                      </td>
                      {weekDateStrings.map(dateStr => {
                        const key = gridKey(m.record_id, dateStr);
                        const value = shiftGrid[key] ?? '';
                        return (
                          <td key={dateStr} className="p-1.5 min-w-[120px]">
                            <select
                              value={value}
                              onChange={e => handleShiftChange(m.record_id, dateStr, e.target.value)}
                              className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">— Keine Schicht —</option>
                              {schichttypen.map(st => (
                                <option key={st.record_id} value={st.record_id}>
                                  {st.fields.schichtname ?? '(Unbenannt)'}
                                  {st.fields.startzeit && st.fields.endzeit
                                    ? ` (${st.fields.startzeit}–${st.fields.endzeit})`
                                    : st.fields.startzeit
                                    ? ` ab ${st.fields.startzeit}`
                                    : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              <IconChevronLeft size={16} className="mr-1" />
              Zurück
            </Button>
            <Button
              size="lg"
              onClick={handleSave}
              disabled={loadingShifts || saving}
            >
              {saving ? (
                <>
                  <IconLoader2 size={16} className="mr-2 animate-spin" />
                  Speichern...
                </>
              ) : (
                'Schichtplan speichern'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Summary ── */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 space-y-6">
            {saving && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <IconLoader2 size={32} className="text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-lg">Schichtplan wird gespeichert...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bitte warte einen Moment.
                  </p>
                </div>
                {/* Progress indicator */}
                <div className="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-primary animate-pulse w-2/3" />
                </div>
              </div>
            )}

            {!saving && saveError && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <span className="text-2xl">!</span>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-lg text-destructive">Fehler beim Speichern</p>
                  <p className="text-sm text-muted-foreground mt-1">{saveError}</p>
                </div>
                <Button variant="outline" onClick={() => { setCurrentStep(3); setSaveError(null); }}>
                  <IconChevronLeft size={16} className="mr-1" />
                  Zurück zum Bearbeiten
                </Button>
              </div>
            )}

            {!saving && !saveError && saveResult && (
              <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <IconCheck size={32} className="text-green-600 dark:text-green-400" stroke={2.5} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-xl">Schichtplan gespeichert!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatWeekRange(selectedWeekStart)}
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 w-full">
                  <div className="rounded-xl border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{saveResult.created}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Neu erstellt</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{saveResult.updated}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aktualisiert</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{saveResult.deleted}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Gelöscht</p>
                  </div>
                </div>

                {/* Summary: employees + their assigned shifts */}
                <div className="w-full space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Übersicht je Mitarbeiter:</p>
                  {selectedMitarbeiterList.map(m => {
                    const assignedCount = weekDateStrings.filter(
                      dateStr => (shiftGrid[gridKey(m.record_id, dateStr)] ?? '') !== ''
                    ).length;
                    return (
                      <div
                        key={m.record_id}
                        className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2"
                      >
                        <span className="text-sm font-medium truncate">
                          {[m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            assignedCount > 0
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {assignedCount} Schicht{assignedCount !== 1 ? 'en' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
                  <Button variant="outline" className="flex-1" onClick={handleReset}>
                    Neue Woche planen
                  </Button>
                  <Button className="flex-1" asChild>
                    <a href="#/">Zum Dashboard</a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
