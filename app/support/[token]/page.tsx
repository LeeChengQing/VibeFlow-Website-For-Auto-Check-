import { TicketView } from '@/components/TicketView';
export default async function Page({params}:{params:Promise<{token:string}>}){return <TicketView token={(await params).token}/>;}
