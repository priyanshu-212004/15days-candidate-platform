'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui/state';
import { Briefcase } from 'lucide-react';

interface Props {
  data: { jobTitle: string; count: number }[];
}

export function JobBarChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <EmptyState icon={<Briefcase className="h-5 w-5" />} title="No applications yet" description="Applications by job will appear here." />
    );
  }

  // Cap label length so long job titles don't blow out the chart width.
  const chartData = data.slice(0, 10).map((d) => ({
    ...d,
    label: d.jobTitle.length > 22 ? `${d.jobTitle.slice(0, 21)}…` : d.jobTitle,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="rgb(var(--muted-foreground))" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={140}
            stroke="rgb(var(--muted-foreground))"
          />
          <Tooltip
            cursor={{ fill: 'rgb(var(--muted))' }}
            contentStyle={{
              backgroundColor: 'rgb(var(--popover))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgb(var(--popover-foreground))',
            }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.jobTitle ?? ''}
          />
          <Bar dataKey="count" fill="rgb(var(--chart-2))" radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
