import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Briefcase, Users, KanbanSquare, BarChart3, Settings } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
  { label: 'Candidates', href: '/dashboard/candidates', icon: Users },
  { label: 'Pipeline', href: '/dashboard/pipeline', icon: KanbanSquare },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];
