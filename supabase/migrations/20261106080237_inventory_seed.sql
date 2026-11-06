-- Generated from the existing catalog. Real stock must be entered by an admin.
insert into public.inventory(product_id,name_en,name_ar,price) values
('bahira','Bahira','بهيرة',800),
('zouzou','ZouZou','زوزو',780),
('shawkat','Shawkat','شوكت',750),
('shokreya','Shokreya','شكرية',600),
('zaghloul','Zaghloul','زغلول',850),
('bahgat','Bahgat','بهجت',800),
('bondoq','Bondoq','بندق',550),
('farawla','Farawla','فراولة',550),
('suzy','Suzy','سوزي',250),
('bahloul','Bahloul','بهلول',320),
('bahloul-green','Bahloul','بهلول',320),
('semsem','Semsem','سمسم',280),
('semsem-yellow','Semsem','سمسم',280),
('zooba','Zooba','زووبا',380),
('azza','Azza','عزة',450)
on conflict(product_id) do nothing;
