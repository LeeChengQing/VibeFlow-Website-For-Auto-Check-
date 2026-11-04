import {canonicalWebhook} from '@/lib/canonical-commerce';
export const runtime='nodejs';
export async function POST(request:Request){return canonicalWebhook(request,'toyyibpay');}
