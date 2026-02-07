import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function monthStart(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toISOString().split("T")[0];
}

function monthEnd(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1 + offset, 0);
  return d.toISOString().split("T")[0];
}

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function formatLabel(range: DateRange): string {
  const from = new Date(range.from + "T12:00:00");
  const to = new Date(range.to + "T12:00:00");

  // If same month → show "Janeiro 2026"
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear() && from.getDate() === 1) {
    const last = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    if (to.getDate() === last) {
      const label = from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  // Otherwise show "06/01 – 06/02"
  const fmtFrom = from.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const fmtTo = to.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmtFrom} – ${fmtTo}`;
}

// ── Presets ──────────────────────────────────────────────────────────────

export function getCurrentMonthRange(): DateRange {
  return { from: monthStart(), to: monthEnd() };
}

const PRESETS: Array<{ label: string; range: () => DateRange }> = [
  { label: "Este mês", range: () => ({ from: monthStart(), to: monthEnd() }) },
  { label: "Últimos 7 dias", range: () => ({ from: daysAgo(6), to: todayStr() }) },
  { label: "Últimos 30 dias", range: () => ({ from: daysAgo(29), to: todayStr() }) },
  { label: "Mês passado", range: () => ({ from: monthStart(-1), to: monthEnd(-1) }) },
  { label: "Ano atual", range: () => ({ from: yearStart(), to: todayStr() }) },
];

// ── Component ───────────────────────────────────────────────────────────

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [showPresets, setShowPresets] = useState(false);

  // Navigate previous/next month
  const shiftMonth = (delta: number) => {
    const from = new Date(value.from + "T12:00:00");
    from.setMonth(from.getMonth() + delta, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    onChange({
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    });
  };

  const isCurrentMonth = () => {
    const now = new Date();
    const from = new Date(value.from + "T12:00:00");
    return from.getMonth() === now.getMonth() && from.getFullYear() === now.getFullYear();
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Main bar: < Month label > */}
      <div className="glass-card p-3 flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center touch-feedback"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>

        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-muted/60 transition-colors"
        >
          <Calendar className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">
            {formatLabel(value)}
          </span>
        </button>

        <button
          onClick={() => shiftMonth(1)}
          disabled={isCurrentMonth()}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center touch-feedback",
            isCurrentMonth() ? "bg-muted/50 opacity-50 cursor-not-allowed" : "bg-muted"
          )}
        >
          <ChevronRight className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Presets + custom range */}
      {showPresets && (
        <div className="glass-card p-4 space-y-3 animate-in-up">
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const r = p.range();
              const isActive = r.from === value.from && r.to === value.to;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    onChange(r);
                    setShowPresets(false);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom date inputs */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">De</label>
              <input
                type="date"
                value={value.from}
                max={value.to}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground text-sm focus:border-primary focus:ring-0 outline-none transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Até</label>
              <input
                type="date"
                value={value.to}
                min={value.from}
                max={todayStr()}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground text-sm focus:border-primary focus:ring-0 outline-none transition-all"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
