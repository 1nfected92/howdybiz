// Entirely fictional. Reserved .invalid addresses cannot receive real outreach.
export function samples() {
  const data = [
    ['Juniper Coffee House','Café','Austin, TX · 78701','(512) 555-0101','hello@juniper.invalid','',4.8,128,'Potential','New','sage'],
    ['Bloom & Stem Studio','Florist','Austin, TX · 78704','(512) 555-0102','studio@bloom.invalid','https://bloom.invalid',4.9,84,'Possible','Reviewing','rose'],
    ['Oakline Auto Care','Auto repair','Austin, TX · 78702','(512) 555-0103','service@oakline.invalid','',4.6,215,'Potential','Qualified','blue'],
    ['Sunday Wellness','Wellness','Austin, TX · 78704','(512) 555-0104','hello@sunday.invalid','https://sunday.invalid',4.9,62,'Possible','Follow-up','sand'],
    ['Northstar Barbers','Barbershop','Austin, TX · 78701','(512) 555-0105','book@northstar.invalid','',4.7,173,'Potential','New','sage'],
    ['The Local Table','Restaurant','Austin, TX · 78702','(512) 555-0106','info@localtable.invalid','https://localtable.invalid',4.5,309,'Not Needed','Not Interested','rose'],
    ['Cedar Home Services','Home services','Austin, TX · 78703','(512) 555-0107','','',4.8,45,'Possible','New','sand']
  ];
  return data.map((v, i) => ({ id: crypto.randomUUID(), place_id: `sample-${i}`, name:v[0],category:v[1],address:v[2],zip:v[2].slice(-5),phone:v[3],email:v[4],website:v[5],rating:v[6],review_count:v[7],score:v[8],stage:v[9],tone:v[10], website_status:v[5]?'Unchecked':'Missing', explanation:v[8]==='Not Needed'?'Sample manual assessment: existing solution meets current needs.':'Fictional example. Website need must be established with real evidence.', sample:true, mode:'demo', source:'Fictional sample — not Google data',last_checked:new Date().toISOString(),notes:'',proposals:[],payments:[],tasks:[],activity:[{id:crypto.randomUUID(),at:new Date().toISOString(),label:'Sample record loaded',detail:'Fictional business for interface testing.'}] }));
}
