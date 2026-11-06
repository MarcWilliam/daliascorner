/* Admin-only service worker. Never caches orders, credentials or customer data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
 let data = {};
 try { data = event.data?.json() || {}; } catch {}
 event.waitUntil(self.registration.showNotification('Dalia’s Corner', {
   body: typeof data.body === 'string' ? data.body : 'Store update · تحديث المتجر',
   icon: '/icon-192.png', badge: '/icon-192.png',
   tag: typeof data.tag === 'string' ? data.tag : 'store-update',
   data: {url: '/admin/'}
 }));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil((async () => {
   const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
   const existing = windows.find(c => new URL(c.url).pathname.startsWith('/admin/'));
   if(existing) return existing.focus();
   return self.clients.openWindow('/admin/');
 })());
});
