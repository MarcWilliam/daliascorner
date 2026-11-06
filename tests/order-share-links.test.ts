import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
const skipped=new Set(['20261106080241_expiry.sql','20261106083056_notification_cron.sql','20261106092948_meta_dispatch_schedule.sql']);
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users(id) values('${admin}'),('${customer}'),('${other}');`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!skipped.has(f)).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(`insert into admin_users values('${admin}');`);
 const token=crypto.randomUUID();
 const row=(await db.query<{id:string}>(`insert into orders(idempotency_key,request_hash,customer_name,customer_phone,customer_address,locale,subtotal,delivery_fee,guest_token_hash,marketing_consent) values(gen_random_uuid(),'test','TEST','01000000000','TEST address','en',100,20,encode(sha256(convert_to($1::text,'UTF8')),'hex'),true) returning id`,[token])).rows[0];
 return {db,token,id:row.id};
}
async function actor(db:PGlite,id:string,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
async function guest(db:PGlite,token:string){return (await db.query<{v:Record<string,unknown>|null}>('select guest_order($1) v',[token])).rows[0].v;}
async function mint(db:PGlite,id:string){return (await db.query<{v:string}>('select create_order_share_link($1) v',[id])).rows[0].v;}
test('admin share links retain original tracking, resolve only hashed tokens, and never allow client minting or raw access',async()=>{
 const {db,token,id}=await setup();try{
 await actor(db,admin);const share=await mint(db,id);assert.notEqual(share,token);
 await actor(db,'','anon');assert.ok(await guest(db,token));assert.ok(await guest(db,share));assert.equal(await guest(db,crypto.randomUUID()),null);
 await assert.rejects(mint(db,id),/permission denied/);await assert.rejects(db.query('select * from private.order_share_links'),/permission denied/);
 await actor(db,customer);await assert.rejects(mint(db,id),/FORBIDDEN/);await assert.rejects(db.query('select private.resolve_order_token($1)',[share]),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query<{v:number}>('select order_total::int v from orders where id=$1',[id])).rows[0].v,120);
 await db.query('update orders set subtotal=150,delivery_fee=35 where id=$1',[id]);assert.equal((await db.query<{v:number}>('select order_total::int v from orders where id=$1',[id])).rows[0].v,185);
 const stored=(await db.query<{token_hash:string}>('select token_hash from private.order_share_links')).rows[0].token_hash;assert.match(stored,/^[a-f0-9]{64}$/);assert.notEqual(stored,share);
 }finally{await db.close();}
});
test('share claim is exclusive, revokes guest visibility for every token, and prevents admin claiming',async()=>{
 const {db,token,id}=await setup();try{
 await actor(db,admin);const share=await mint(db,id);await assert.rejects(db.query('select claim_order($1)',[share]),/ORDER_NOT_AVAILABLE/);
 await actor(db,customer);await db.query('select claim_order($1)',[share]);await db.query('select claim_order($1)',[token]);
 await actor(db,other);await assert.rejects(db.query('select claim_order($1)',[share]),/ORDER_NOT_AVAILABLE/);await db.query('select revoke_order_marketing($1)',[share]);
 await actor(db,'','anon');assert.equal(await guest(db,share),null);assert.equal(await guest(db,token),null);await db.query('select revoke_order_marketing($1)',[token]);
 await db.exec('reset role');assert.equal((await db.query<{v:boolean}>('select marketing_consent v from orders where id=$1',[id])).rows[0].v,true);
 await actor(db,customer);await db.query('select revoke_order_marketing($1)',[share]);await db.exec('reset role');assert.equal((await db.query<{v:boolean}>('select marketing_consent v from orders where id=$1',[id])).rows[0].v,false);
 }finally{await db.close();}
});
test('expired share links stop resolving without breaking original links; unclaimed marketing can be revoked',async()=>{
 const {db,token,id}=await setup();try{
 await actor(db,admin);const share=await mint(db,id);
 await actor(db,'','anon');await db.query('select revoke_order_marketing($1)',[share]);await db.exec('reset role');assert.equal((await db.query<{v:boolean}>('select marketing_consent v from orders where id=$1',[id])).rows[0].v,false);
 await db.exec("update private.order_share_links set expires_at=now()-interval '1 second'");
 await actor(db,'','anon');assert.equal(await guest(db,share),null);assert.ok(await guest(db,token));
 await actor(db,customer);await assert.rejects(db.query('select claim_order($1)',[share]),/ORDER_NOT_AVAILABLE/);await db.query('select claim_order($1)',[token]);
 }finally{await db.close();}
});
