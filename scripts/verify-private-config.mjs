// Checks server setup without printing secret values or writing them to logs.
import {readFileSync} from 'node:fs';
function env(path){return Object.fromEntries(readFileSync(path,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));}
const config=env('.env.push.local'),pub=env('.env.local');
const notify=await fetch(`${pub.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-admin`,{method:'POST',headers:{Authorization:`Bearer ${config.NOTIFY_SECRET}`,'Content-Type':'application/json'},body:'{}'});
console.log('Notification configuration check HTTP:',notify.status);
if(notify.ok){const body=await notify.json();console.log('Notification worker reached database:',typeof body.processed==='number');}
if(config.TURNSTILE_SECRET_KEY){
 const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:config.TURNSTILE_SECRET_KEY,response:'invalid-configuration-probe'})}).then(r=>r.json());
 console.log('Turnstile secret rejected:',(verification['error-codes']??[]).includes('invalid-input-secret'));
 console.log('Turnstile validation result codes:',verification['error-codes']);
}
