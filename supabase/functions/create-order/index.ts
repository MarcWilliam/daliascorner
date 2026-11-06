// The pre-website checkout did not require delivery/payment selection.
// Retired after migrating the review site to place-order; never accept writes here.
Deno.serve(() => new Response(JSON.stringify({error:'CHECKOUT_UPDATED',message:'Refresh the store and place your order using the current checkout.'}),{
 status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
}));
