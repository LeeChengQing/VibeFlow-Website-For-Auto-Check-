const retired=()=>Response.json({error:'LEGACY_API_RETIRED',message:'Use the current extension or private purchase page.'},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=retired;
export const POST=retired;
