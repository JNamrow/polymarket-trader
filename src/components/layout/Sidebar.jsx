import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Settings, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

// Desktop: fixed left rail
function DesktopSidebar({ location }) {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-14 bg-sidebar border-r border-sidebar-border flex-col z-50">
      <div className="h-14 flex items-center justify-center border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              title={label}
              className={cn(
                "pressable flex items-center justify-center w-10 h-10 mx-auto rounded-lg",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-4 h-4" />
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border flex justify-center">
        <div className="w-2 h-2 rounded-full bg-primary motion-safe:animate-pulse-glow" />
      </div>
    </aside>
  );
}

// Mobile: fixed bottom tab bar
function MobileTabBar({ location }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border flex items-center justify-around px-4 pb-safe">
      {navItems.map(({ path, icon: Icon, label }) => {
        const isActive = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={cn(
              "pressable flex flex-col items-center gap-1 py-3 px-6 rounded-xl",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary))]")} />
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const location = useLocation();
  return (
    <>
      <DesktopSidebar location={location} />
      <MobileTabBar location={location} />
    </>
  );
}