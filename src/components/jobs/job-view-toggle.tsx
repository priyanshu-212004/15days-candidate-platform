'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LayoutGrid, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function JobViewToggle({ view }: { view: 'list' | 'swipe' }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(next: 'list' | 'swipe') {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'list') params.delete('view');
    else params.set('view', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center rounded-md border border-border p-0.5">
      <Button
        type="button"
        variant={view === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        className="gap-1.5"
        onClick={() => setView('list')}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> List
      </Button>
      <Button
        type="button"
        variant={view === 'swipe' ? 'secondary' : 'ghost'}
        size="sm"
        className="gap-1.5"
        onClick={() => setView('swipe')}
      >
        <Layers className="h-3.5 w-3.5" /> Swipe
      </Button>
    </div>
  );
}
