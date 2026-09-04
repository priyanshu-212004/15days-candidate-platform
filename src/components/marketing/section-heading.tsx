import { cn } from '@/lib/utils';

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  className?: string;
}

export function SectionHeading({ eyebrow, title, description, align = 'center', className }: Props) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <p className="mb-3 text-sm font-medium text-primary">{eyebrow}</p>}
      <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-lg text-muted-foreground">{description}</p>}
    </div>
  );
}
