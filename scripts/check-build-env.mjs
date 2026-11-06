// Cloudflare's static build must never silently ship a disconnected storefront.
if (process.env.CF_PAGES === '1') {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  ];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing Pages build configuration: ${missing.join(', ')}. Check wrangler.toml [vars].`);
  console.log('Pages public backend, checkout and push configuration is present.');
}
