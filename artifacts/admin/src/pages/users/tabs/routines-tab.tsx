/**
 * RoutinesTab — shows inferred behavioural routines, deviation history,
 * and source activity events for admin debugging.
 *
 * Routines are rule-based (no ML). Evidence is real interaction events:
 * USER_STARTED_CONVERSATION, MEDICATION_CONFIRMED_TAKEN, USER_REPORTED_ACTIVITY.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// ── Types ─────────────────────────────────────────────────────────────────────

type RoutineDeviation = {
  id: string;
  routineId: string;
  userId: string;
  detectedAtUtc: string;
  resolvedAtUtc: string | null;
  checkInTriggeredAt: string | null;
  checkInText: string | null;
  notes: string | null;
};

type Routine = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  routineType: string;
  expectedTime: string | null;
  detectionWindowMinutes: number;
  evidenceCount: number;
  confidence: number;
  sourceEventTypes: string[];
  baselineMetrics: {
    avgMinutesSinceMidnight?: number;
    stdDevMinutes?: number;
    observedDays?: string[];
    lastObservedAt?: string;
  } | null;
  isActive: boolean;
  updatedAt: string;
  recentDeviations: RoutineDeviation[];
};

type ActivityEvent = {
  id: string;
  eventType: string;
  occurredAtUtc: string;
  metadata: Record<string, unknown> | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTINE_TYPE_LABELS: Record<string, string> = {
  MORNING_CONVERSATION: "Morning conversation",
  MEDICATION_CONFIRMATION: "Medication confirmation",
  REPORTED_ACTIVITY: "Reported activity",
  MANUAL: "Manual",
};

const ROUTINE_TYPE_COLORS: Record<string, string> = {
  MORNING_CONVERSATION: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  MEDICATION_CONFIRMATION: "bg-green-500/15 text-green-300 border-green-500/30",
  REPORTED_ACTIVITY: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  MANUAL: "bg-muted text-muted-foreground",
};

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

// ── Routine card ──────────────────────────────────────────────────────────────

function RoutineCard({ routine, userId }: { routine: Routine; userId: string }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = ROUTINE_TYPE_COLORS[routine.routineType] ?? ROUTINE_TYPE_COLORS.MANUAL;
  const pendingDeviations = routine.recentDeviations.filter(d => !d.resolvedAtUtc);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-start gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm text-foreground">{routine.name}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${typeColor}`}>
              {ROUTINE_TYPE_LABELS[routine.routineType] ?? routine.routineType}
            </span>
            {!routine.isActive && (
              <span className="text-xs text-muted-foreground">(inactive)</span>
            )}
            {pendingDeviations.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {pendingDeviations.length} open
              </span>
            )}
          </div>
          {routine.description && (
            <p className="text-xs text-muted-foreground truncate">{routine.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 text-right">
          {routine.expectedTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{routine.expectedTime} ±{routine.detectionWindowMinutes / 2}min</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <BarChart3 className="h-3 w-3" />
            <span>{routine.evidenceCount} observations</span>
          </div>
          <ConfidenceBar value={routine.confidence} />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t bg-muted/20 px-4 pb-4 pt-3 space-y-4">
          {/* Baseline metrics */}
          {routine.baselineMetrics && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Baseline metrics
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {routine.baselineMetrics.avgMinutesSinceMidnight != null && (
                  <div className="rounded-lg bg-background border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Avg time</p>
                    <p className="text-sm font-mono font-medium">
                      {minutesToHHMM(routine.baselineMetrics.avgMinutesSinceMidnight)}
                    </p>
                  </div>
                )}
                {routine.baselineMetrics.stdDevMinutes != null && (
                  <div className="rounded-lg bg-background border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Std dev</p>
                    <p className="text-sm font-mono font-medium">
                      ±{routine.baselineMetrics.stdDevMinutes}min
                    </p>
                  </div>
                )}
                <div className="rounded-lg bg-background border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Evidence</p>
                  <p className="text-sm font-mono font-medium">{routine.evidenceCount} days</p>
                </div>
                {routine.baselineMetrics.lastObservedAt && (
                  <div className="rounded-lg bg-background border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Last seen</p>
                    <p className="text-sm font-mono font-medium">
                      {new Date(routine.baselineMetrics.lastObservedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Source event types */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Source events
            </p>
            <div className="flex flex-wrap gap-1.5">
              {routine.sourceEventTypes.map(et => (
                <span
                  key={et}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border font-mono"
                >
                  {et}
                </span>
              ))}
            </div>
          </div>

          {/* Recent deviations */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Recent deviations ({routine.recentDeviations.length})
            </p>
            {routine.recentDeviations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No deviations in the past 30 days.</p>
            ) : (
              <div className="space-y-2">
                {routine.recentDeviations.map(dev => (
                  <div
                    key={dev.id}
                    className="rounded-lg border px-3 py-2 bg-background text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground font-mono">
                        {formatTime(dev.detectedAtUtc)}
                      </span>
                      {dev.resolvedAtUtc ? (
                        <span className="inline-flex items-center gap-1 text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolved
                        </span>
                      ) : dev.checkInTriggeredAt ? (
                        <span className="inline-flex items-center gap-1 text-blue-400">
                          <Activity className="h-3 w-3" />
                          Check-in sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </div>
                    {dev.checkInText && (
                      <p className="text-muted-foreground italic">
                        "{dev.checkInText}"
                      </p>
                    )}
                    {dev.notes && (
                      <p className="text-muted-foreground">{dev.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Activity events panel ─────────────────────────────────────────────────────

const EVENT_TYPE_OPTIONS = [
  "ALL",
  "USER_STARTED_CONVERSATION",
  "USER_ENDED_CONVERSATION",
  "REMINDER_TRIGGERED",
  "REMINDER_CONFIRMED",
  "MEDICATION_CONFIRMED_TAKEN",
  "MEDICATION_CONFIRMED_NOT_TAKEN",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_ACKNOWLEDGED",
  "USER_REPORTED_ACTIVITY",
  "PHOTO_CONVERSATION",
  "TEMPORARY_DND_SET",
  "COMPANION_PROACTIVE_CHECKIN",
];

function ActivityEventsPanel({ userId }: { userId: string }) {
  const [filterType, setFilterType] = useState("ALL");

  const { data, isLoading, refetch } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["admin-activity-events", userId, filterType],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (filterType !== "ALL") params.set("eventType", filterType);
      const r = await fetch(`/api/admin/users/${userId}/activity-events?${params}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load events");
      return r.json() as Promise<{ events: ActivityEvent[] }>;
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-xs bg-muted border rounded-lg px-2 py-1.5 text-foreground"
        >
          {EVENT_TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>{t === "ALL" ? "All event types" : t}</option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      ) : !data?.events.length ? (
        <p className="text-sm text-muted-foreground">No events recorded yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {data.events.map(ev => (
            <div
              key={ev.id}
              className="flex items-start gap-3 rounded-lg border px-3 py-2 bg-card text-xs"
            >
              <span className="font-mono text-muted-foreground shrink-0 mt-0.5">
                {new Date(ev.occurredAtUtc).toLocaleTimeString()}
              </span>
              <span className="font-mono text-foreground font-medium">{ev.eventType}</span>
              {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                <span className="text-muted-foreground truncate">
                  {JSON.stringify(ev.metadata)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function RoutinesTab({ userId }: { userId: string }) {
  const [showEvents, setShowEvents] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ routines: Routine[] }>({
    queryKey: ["admin-routines", userId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/users/${userId}/routines`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load routines");
      return r.json() as Promise<{ routines: Routine[] }>;
    },
  });

  const routines = data?.routines ?? [];
  const totalDeviations = routines.reduce((s, r) => s + r.recentDeviations.length, 0);
  const openDeviations = routines.reduce(
    (s, r) => s + r.recentDeviations.filter(d => !d.resolvedAtUtc).length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Daily Routines</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rule-based patterns inferred from interaction history. No machine learning —
            routines are established after a configurable number of consistent observations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary stats */}
      {routines.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Inferred routines</p>
            <p className="text-2xl font-semibold">{routines.filter(r => r.isActive).length}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Deviations (30d)</p>
            <p className="text-2xl font-semibold">{totalDeviations}</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${openDeviations > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-card"}`}>
            <p className="text-xs text-muted-foreground">Open deviations</p>
            <p className={`text-2xl font-semibold ${openDeviations > 0 ? "text-amber-400" : ""}`}>
              {openDeviations}
            </p>
          </div>
        </div>
      )}

      {/* Routines list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl border bg-card h-16 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load routines.
        </div>
      ) : routines.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-8 text-center">
          <Activity className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No routines inferred yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Routines are established after a configurable minimum number of consistent
            observations (default: 5). The inference engine runs every 6 hours.
          </p>
          <p className="text-xs text-muted-foreground mt-3 font-mono">
            Events required: USER_STARTED_CONVERSATION · MEDICATION_CONFIRMED_TAKEN · USER_REPORTED_ACTIVITY
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map(r => (
            <RoutineCard key={r.id} routine={r} userId={userId} />
          ))}
        </div>
      )}

      {/* Activity events debug panel */}
      <div className="rounded-xl border overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
          onClick={() => setShowEvents(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Activity events (debug)</span>
          </div>
          {showEvents
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showEvents && (
          <div className="border-t bg-muted/10 p-4">
            <ActivityEventsPanel userId={userId} />
          </div>
        )}
      </div>
    </div>
  );
}
