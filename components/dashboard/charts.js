'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Status colors are reserved for execution state; leads use the single brand hue.
const COLORS = { succeeded: '#059669', failed: '#dc2626', other: '#9ca3af', brand: '#4f46e5' };
const AXIS = { fontSize: 12, fill: '#6b7280' };

function shortDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function VolumeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-ink">{shortDay(label)}</p>
      {[
        ['Succeeded', row.succeeded, COLORS.succeeded],
        ['Failed', row.failed, COLORS.failed],
        ['Other', row.other, COLORS.other],
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
  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-muted" aria-hidden="true">
        {[
          ['Succeeded', COLORS.succeeded],
          ['Failed', COLORS.failed],
          ['Pending / cancelled', COLORS.other],
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
            <CartesianGrid vertical={false} stroke="#eef0f3" />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(17,24,39,0.04)' }} />
            <Bar
              dataKey="succeeded"
              stackId="a"
              fill={COLORS.succeeded}
              stroke="#fff"
              strokeWidth={2}
            />
            <Bar dataKey="failed" stackId="a" fill={COLORS.failed} stroke="#fff" strokeWidth={2} />
            <Bar
              dataKey="other"
              stackId="a"
              fill={COLORS.other}
              stroke="#fff"
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
                background: d.color ?? COLORS.brand,
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
