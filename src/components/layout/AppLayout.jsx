import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Desktop: offset for side rail. Mobile: offset bottom for tab bar */}
      <main className="md:pl-14 min-h-screen pb-20 md:pb-0">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}