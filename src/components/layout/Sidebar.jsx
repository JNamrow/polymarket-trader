import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, Settings, Activity, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/new-bot', icon: Bot, label: 'New Bot' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-56 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <span className="text-sm font-semibold text-foreground hidden lg:block">PolyTrader</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
          <span className="text-xs text-muted-foreground hidden lg:block">System Online</span>
        </div>
      </div>
    </aside>
  );
}