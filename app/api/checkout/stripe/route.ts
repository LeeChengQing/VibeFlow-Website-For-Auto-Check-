import { canonicalCheckout } from '@/lib/canonical-commerce';
export const runtime='nodejs';
export async function POST(request:Request){return canonicalCheckout(request,'stripe');}
