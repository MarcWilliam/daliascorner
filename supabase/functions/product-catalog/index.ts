import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import metadata from '../_shared/catalog.json' with {type:'json'};
const cell=(value:unknown)=>`"${String(value).replaceAll('"','""')}"`;
Deno.serve(async req=>{
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405});
 const key=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}').default??Deno.env.get('SUPABASE_ANON_KEY');
 const db=createClient(Deno.env.get('SUPABASE_URL')!,key!,{auth:{persistSession:false}});
 const {data,error}=await db.rpc('store_availability');
 if(error)return new Response('Catalog temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
 const rows=[['id','title','description','availability','condition','price','link','image_link','brand','item_group_id','color']];
 for(const p of metadata){
  const stock=data?.find((s:{product_id:string})=>s.product_id===p.id);
  if(!stock)continue;
  rows.push([p.id,p.title,p.description,stock.available>0?'in stock':'out of stock','new',`${Number(stock.price).toFixed(2)} EGP`,`https://daliascorner.com/characters/${p.id}/`,`https://daliascorner.com${p.image}`,"Dalia's Corner",p.group,p.color]);
 }
 return new Response(req.method==='HEAD'?null:rows.map(row=>row.map(cell).join(',')).join('\n')+'\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'public, max-age=60'}});
});
