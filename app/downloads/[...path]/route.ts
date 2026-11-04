export function GET(){return new Response('Private purchase access required',{status:410,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
