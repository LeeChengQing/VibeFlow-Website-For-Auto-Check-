import { OrderStatus } from '@/components/OrderStatus';
export default async function Page({params}:{params:Promise<{token:string}>}){return <OrderStatus token={(await params).token}/>;}
