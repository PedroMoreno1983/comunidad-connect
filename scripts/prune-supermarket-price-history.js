// Daily retention only; current catalog and purchase/financial records are untouched.
async function main() {
  const base=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new Error('Supabase maintenance credentials are required.');
  const cutoff=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const url=new URL('/rest/v1/supermarket_price_history',base);
  url.searchParams.set('observed_at',`lt.${cutoff}`);
  const response=await fetch(url,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,Prefer:'return=minimal'},signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Price retention failed: HTTP ${response.status}`);
  console.log(JSON.stringify({completed:true,retainedDays:7,cutoff}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
