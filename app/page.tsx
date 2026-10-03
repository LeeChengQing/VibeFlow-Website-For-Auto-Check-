import { Landing } from '@/components/Landing';
import { Hero } from '@/components/Hero';
import { HeroPurchaseCard } from '@/components/HeroPurchaseCard';

export default function Home() {
  return (
    <Landing>
      <Hero>
        <HeroPurchaseCard />
      </Hero>
    </Landing>
  );
}
