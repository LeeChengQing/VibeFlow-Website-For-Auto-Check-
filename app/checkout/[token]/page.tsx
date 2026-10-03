import { Checkout } from '@/components/Checkout';
export default async function Page({params}:{params:Promise<{token:string}>}){return <Checkout token={(await params).token}/>;}
