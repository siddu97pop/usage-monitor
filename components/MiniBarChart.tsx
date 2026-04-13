'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface DataPoint {
  label: string;
  value: number;
}

interface MiniBarChartProps {
  data: DataPoint[];
  accent: string;
  accentDim: string;
  title: string;
  unit: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
  accent,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  unit: string;
  accent: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#1e1e2e] bg-[#16161f] px-3 py-2 shadow-xl">
      <p className="font-mono text-[10px] text-slate-400">{label}</p>
      <p className="font-mono text-sm font-medium" style={{ color: accent }}>
        {payload[0].value.toLocaleString()}
        <span className="ml-1 text-[10px] text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

export default function MiniBarChart({
  data,
  accent,
  accentDim,
  title,
  unit,
}: MiniBarChartProps) {
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-slate-500">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={64}>
        <BarChart
          data={data}
          margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="20%"
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={false}
            tickLine={false}
            // Show only every Nth label to avoid cramping
            interval={data.length > 12 ? Math.floor(data.length / 6) : 0}
          />
          <YAxis hide domain={[0, max || 1]} />
          <Tooltip
            content={<CustomTooltip unit={unit} accent={accent} />}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={14}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.value > 0 ? accent : accentDim}
                fillOpacity={entry.value > 0 ? 0.85 : 0.2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
