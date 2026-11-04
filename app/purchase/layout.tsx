import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'购买确认 · Auto-Check',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function PurchaseLayout({children}:{children:React.ReactNode}){return children;}
