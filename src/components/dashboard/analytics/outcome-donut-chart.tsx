'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState } from '@/components/ui/state';
import { PieChart as PieIcon } from 'lucide-react';

const COLORS = ['rgb(var(--chart-1))', 'rgb(var(--destructive))'];

export function OutcomeDonutChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <EmptyState icon={<PieIcon className="h-5 w-5" />} title="No outcomes yet" description="Shortlisted and rejected candidates will appear here." />
    );
  }

  return (
    <div className="flex items-center gap-6">
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgb(var(--popover))',
                border: '1px solid rgb(var(--border))',
                borderRadius: 8,
                fontSize: 12,
                color: 'rgb(var(--popover-foreground))',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {data.map((entry, i) => (
          <div key={entry.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-semibold tabular-nums">{entry.value}</span>
            <span className="text-xs text-muted-foreground">({total > 0 ? Math.round((entry.value / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
