'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui/state';
import { TrendingUp } from 'lucide-react';
import { formatScore } from '@/lib/utils';

interface Props {
  data: { date: string; value: number }[];
  label: string;
  emptyDescription: string;
  color?: string;
  /**
   * How to format the tooltip value. A plain string, not a function —
   * Server Components (like the analytics page) can't pass functions to
   * Client Components across the RSC boundary, so the formatting logic
   * lives here instead and callers just pick which one they want.
   */
  format?: 'number' | 'score';
}

function formatValue(value: number, format: 'number' | 'score'): string | number {
  return format === 'score' ? formatScore(value) : value;
}

export function TrendChart({ data, label, emptyDescription, color = 'rgb(var(--chart-1))', format = 'number' }: Props) {
  if (data.length === 0) {
    return <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No data yet" description={emptyDescription} />;
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`trend-fill-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="rgb(var(--muted-foreground))"
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="rgb(var(--muted-foreground))" allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'rgb(var(--border))' }}
            contentStyle={{
              backgroundColor: 'rgb(var(--popover))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgb(var(--popover-foreground))',
            }}
            formatter={(v: number) => [formatValue(v, format), label]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#trend-fill-${label})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
