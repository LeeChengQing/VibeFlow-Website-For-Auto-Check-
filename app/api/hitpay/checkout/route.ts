export const runtime='nodejs';

// Permanently retired for all new purchases, including administrator/sandbox requests.
export async function POST() {
  return Response.json({error:'PROVIDER_RETIRED'},{status:410,headers:{'Cache-Control':'no-store'}});
}
