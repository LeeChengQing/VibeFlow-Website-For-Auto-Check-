import {createUnifiedCheckout} from '@/lib/unified-commerce';
export const runtime='nodejs';
export async function POST(request:Request){return createUnifiedCheckout(request,'stripe');}
