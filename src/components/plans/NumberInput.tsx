import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  value: number | null;
  defaultValue?: number | null;
  onChange: (v: number | null) => void;
  step?: string;
  min?: number;
  className?: string;
  highlight?: boolean;
  emptyAsNull?: boolean;
  disabled?: boolean;
  title?: string;
  placeholder?: string;
  ariaLabel?: string;
  showSpinner?: boolean;
};

// スピナー無しの数値入力 + リセットボタン (value !== defaultValue のときだけ)
export function NumberInput({
  value,
  defaultValue,
  onChange,
  step = '0.1',
  min = 0,
  className,
  highlight,
  emptyAsNull,
  disabled,
  title,
  placeholder,
  ariaLabel,
  showSpinner,
}: Props) {
  const displayValue = value === null || value === undefined ? '' : String(value);
  const showReset =
    defaultValue !== undefined &&
    defaultValue !== null &&
    value !== defaultValue &&
    !disabled;

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <input
        type="number"
        step={step}
        min={min}
        value={displayValue}
        disabled={disabled}
        title={title}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(emptyAsNull ? null : 0);
          } else {
            const n = Number(raw);
            onChange(isNaN(n) ? 0 : n);
          }
        }}
        className={cn(
          'w-full rounded border px-2 py-1 text-right text-sm outline-none transition-colors',
          !showSpinner && 'no-spin',
          highlight
            ? 'border-amber-200 bg-amber-50 focus:border-amber-400 focus:bg-amber-100'
            : 'border-slate-200 bg-white focus:border-slate-400',
          disabled && 'opacity-60 bg-slate-50',
          showReset && 'pr-6',
        )}
      />
      {showReset && (
        <button
          type="button"
          onClick={() => onChange(defaultValue ?? 0)}
          title={`デフォルト (${defaultValue}) に戻す`}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 opacity-60 hover:bg-slate-100 hover:text-slate-700 hover:opacity-100"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
