// Public provider settings only; never reads OAuth secrets or user sessions.
import {readFileSync} from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.startsWith('NEXT_PUBLIC_')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const r=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}});
if(!r.ok)throw Error('Auth settings unavailable');const data=await r.json();
console.log(JSON.stringify({google_enabled:data.external?.google===true,facebook_enabled:data.external?.facebook===true}));
