import {useMemo} from 'react';
import {AlertCircle, Lightbulb, RotateCcw} from 'lucide-react';
import type {IdentifiedWasteItem, WasteAnalysisResponse, WasteCategory} from '../types.ts';
import {CATEGORY_META, CATEGORY_ORDER} from './CategoryConfig.ts';

interface ResultPanelProps {
  result: WasteAnalysisResponse;
  dormLocation: string;
  onScanAnother: () => void;
}

export function ResultPanel({result, dormLocation, onScanAnother}: ResultPanelProps) {
  const grouped = useMemo(() => {
    const map: Record<WasteCategory, IdentifiedWasteItem[]> = {
      COMPOST: [],
      RECYCLING: [],
      TRASH: [],
      'CHECK FIRST': [],
    };
    for (const item of result.items) {
      map[item.classification].push(item);
    }
    return map;
  }, [result.items]);

  if (result.isUnclear) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#132018]">Please upload a clearer photo</h3>
            <p className="mt-1 text-sm leading-relaxed text-[#4B5E52]">{result.unclearMessage}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onScanAnother}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#15803D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#166534] sm:w-auto whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
          Try Another Photo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bin location + short diversion summary */}
      <div className="rounded-2xl border border-[#DCE5DC] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-[#132018]">
            Sorting for {dormLocation}
          </p>
          <p className="font-mono text-xs font-medium text-[#15803D] tabular-nums">
            {grouped.COMPOST.length} Compost · {grouped.RECYCLING.length} Recycling · {grouped.TRASH.length} Trash
            {grouped['CHECK FIRST'].length > 0 ? ` · ${grouped['CHECK FIRST'].length} Check First` : ''}
          </p>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-[#3E5045]">{result.diversionSummary}</p>
      </div>

      {/* Simple grouped buckets: Compost, Recycling, Trash (+ Check First if needed) */}
      <div className="space-y-3">
        {CATEGORY_ORDER.map((category) => {
          const items = grouped[category];
          if (items.length === 0) {
            return null;
          }
          const meta = CATEGORY_META[category];
          const Icon = meta.Icon;

          return (
            <section
              key={category}
              className={`rounded-2xl border ${meta.borderClass} bg-white p-4 sm:p-5`}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#EDF2ED] pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.iconBgClass}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h3 className={`text-base font-bold ${meta.textClass}`}>{meta.label}</h3>
                </div>
                <span className="text-xs font-medium text-[#5A6D61]">
                  {items[0].schoolBin}
                </span>
              </div>

              <ul className="mt-3 divide-y divide-[#F0F4F0]">
                {items.map((item, idx) => (
                  <li key={`${item.name}-${idx}`} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-[#132018]">{item.name}</p>
                    <p className="mt-0.5 text-sm leading-snug text-[#4B5E52]">{item.explanation}</p>
                    {item.schoolBin !== items[0].schoolBin && (
                      <p className="mt-1 text-xs font-medium text-[#2D3E34]">Bin: {item.schoolBin}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Short environmental tip + Scan Another button */}
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" aria-hidden="true" />
          <p className="text-sm leading-snug text-emerald-950">{result.environmentalTip}</p>
        </div>

        <button
          type="button"
          onClick={onScanAnother}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#C8D6C8] bg-white px-4 py-2 text-sm font-semibold text-[#132018] transition-colors hover:bg-[#EDF3ED] whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
          Scan Another
        </button>
      </div>
    </div>
  );
}
