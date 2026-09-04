'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X, Plus } from 'lucide-react';
import { navItems } from './nav-items';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-border bg-surface p-4 shadow-overlay">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <Button asChild className="mb-3 w-full justify-start gap-2">
            <Link href="/dashboard/interviews/new">
              <Plus className="h-4 w-4" />
              Create interview
            </Link>
          </Button>

          <nav className="grid grid-cols-2 gap-1.5 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
              const active = item.href === '/dashboard' ? pathname === item.href : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium',
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
