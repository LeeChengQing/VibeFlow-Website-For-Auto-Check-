import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="contents" data-admin-surface>{children}</div>;
}
