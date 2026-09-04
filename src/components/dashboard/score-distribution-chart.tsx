'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui/state';
import { BarChart3 } from 'lucide-react';

interface Props {
  data: { range: string; count: number }[];
}

export function ScoreDistributionChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="No evaluations yet"
        description="Scores appear here once candidates complete interviews."
      />
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="range"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="rgb(var(--muted-foreground))"
          />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="rgb(var(--muted-foreground))" allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgb(var(--muted))' }}
            contentStyle={{
              backgroundColor: 'rgb(var(--popover))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgb(var(--popover-foreground))',
            }}
            labelFormatter={(label) => `Score ${label}`}
          />
          <Bar dataKey="count" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
