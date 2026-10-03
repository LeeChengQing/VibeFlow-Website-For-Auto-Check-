import type { ReactNode } from 'react';
import { PageTransitionWrapper } from '@/components/PageTransitionWrapper';

export default function Template({ children }: { children: ReactNode }) {
  return <PageTransitionWrapper>{children}</PageTransitionWrapper>;
}
