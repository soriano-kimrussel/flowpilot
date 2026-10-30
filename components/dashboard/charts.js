'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '@/components/theme/theme';

// Status colors are reserved for execution state; leads use the single brand hue.
// SVG attributes can't read CSS variables reliably, so chart colors are picked per theme.
const PALETTES = {
  dark: {
    succeeded: '#34d399',
    failed: '#fb7185',
    other: '#5b6390',
    grid: 'rgba(148,163,255,0.1)',
    axis: '#7d84a8',
    gap: '#0d1224',
    cursor: 'rgba(139,92,246,0.08)',
  },
  light: {
    succeeded: '#059669',
    failed: '#e11d48',
    other: '#a5abc4',
    grid: '#eceef6',
    axis: '#6a7090',
    gap: '#ffffff',
    cursor: 'rgba(124,58,237,0.06)',
  },
};
const BRAND = 'var(--color-brand-500)';

function shortDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function VolumeTooltip({ active, payload, label, colors }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass rounded-lg border border-line-strong px-3 py-2 text-xs">
      <p className="mb-1 font-medium text-ink">{shortDay(label)}</p>
      {[
        ['Succeeded', row.succeeded, colors.succeeded],
        ['Failed', row.failed, colors.failed],
        ['Other', row.other, colors.other],
      ].map(([name, value, color]) => (
        <p key={name} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
          {name}: <span className="font-medium text-ink tabular-nums">{value}</span>
        </p>
      ))}
    </div>
  );
}

export function ExecutionVolumeChart({ data }) {
  const colors = PALETTES[useTheme()];
  const axis = { fontSize: 12, fill: colors.axis };
  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-muted" aria-hidden="true">
        {[
          ['Succeeded', colors.succeeded],
          ['Failed', colors.failed],
          ['Pending / cancelled', colors.other],
        ].map(([name, color]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
            {name}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            barCategoryGap="25%"
          >
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={axis}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
            <Tooltip content={<VolumeTooltip colors={colors} />} cursor={{ fill: colors.cursor }} />
            <Bar
              dataKey="succeeded"
              stackId="a"
              fill={colors.succeeded}
              stroke={colors.gap}
              strokeWidth={2}
            />
            <Bar
              dataKey="failed"
              stackId="a"
              fill={colors.failed}
              stroke={colors.gap}
              strokeWidth={2}
            />
            <Bar
              dataKey="other"
              stackId="a"
              fill={colors.other}
              stroke={colors.gap}
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Executions per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Succeeded</th>
            <th>Failed</th>
            <th>Other</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.succeeded}</td>
              <td>{d.failed}</td>
              <td>{d.other}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Single-series horizontal bars: one hue, value labels in ink (not series color). */
export function HorizontalBars({ data, valueLabel = 'Count', emptyText = 'No data yet' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.some((d) => d.value > 0))
    return <p className="py-6 text-center text-sm text-ink-subtle">{emptyText}</p>;
  return (
    <ul className="space-y-2.5" aria-label={valueLabel}>
      {data.map((d) => (
        <li
          key={d.label}
          className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm"
          title={`${d.label}: ${d.value}`}
        >
          <span className="truncate text-ink-muted">{d.label}</span>
          <span className="h-2.5 rounded-r bg-gray-100">
            <span
              className="block h-full rounded-r"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color ?? `linear-gradient(90deg, ${BRAND}, var(--color-accent-500))`,
                minWidth: d.value ? 4 : 0,
              }}
            />
          </span>
          <span className="text-right font-medium text-ink tabular-nums">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}
