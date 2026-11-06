import {readFileSync,writeFileSync} from 'node:fs';
const {products}=JSON.parse(readFileSync('lib/products.json','utf8'));
const metadata=products.map(p=>({id:p.id,title:p.name.en,description:p.blurb.en,image:p.image,group:p.variantOf??p.id,color:p.color?.en??''}));
writeFileSync('supabase/functions/_shared/catalog.json',JSON.stringify(metadata,null,2)+'\n');
