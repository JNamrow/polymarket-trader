import React, { useEffect } from 'react';
import { signIn } from '@/api/base44Client';

/** /login is not linked anywhere. The app owner opens it to reach Base44's login; visitors never see it. */
export default function LoginRedirect() {
  useEffect(() => {
    signIn();
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background text-sm text-muted-foreground">
      Opening sign in…
    </div>
  );
}
