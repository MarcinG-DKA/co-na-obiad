import { cn } from "@/lib/utils";
import { UNITS, isUnit } from "@/lib/units";

interface UnitSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function UnitSelect({ value, onValueChange, disabled, className, id }: UnitSelectProps) {
  const selected = isUnit(value) ? value : "";

  return (
    <select
      id={id}
      aria-label="Unit"
      value={selected}
      disabled={disabled}
      onChange={(e) => {
        onValueChange(e.target.value);
      }}
      className={cn(
        "border-input h-9 min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
        selected ? "text-white" : "text-white/40",
      )}
    >
      <option value="" className="bg-slate-900 text-white">
        Unit
      </option>
      {UNITS.map((unit) => (
        <option key={unit} value={unit} className="bg-slate-900 text-white">
          {unit}
        </option>
      ))}
    </select>
  );
}
