import test from 'node:test';
import assert from 'node:assert/strict';
import {qualified,mergeDiscovery,matches,metrics,csv,assess,safeUrl} from '../src/domain.js';
test('main results require both contacts',()=>{
  assert.equal(qualified({phone:'123',email:'a@b.com'}),true);
  for(const b of [{phone:'123'},{email:'a@b.com'},{phone:' ',email:'a@b.com'},{phone:'123',email:'wrong'}])assert.equal(qualified(b),false);
});
test('refresh preserves CRM while replacing discovery facts',()=>{
  const old={id:'one',place_id:'p',name:'Old',stage:'Contacted',score:'Potential',notes:'Keep',proposals:[{amount:50}],payments:[{amount:25}],activity:[{label:'Sent'}]};
  const result=mergeDiscovery([old],[{id:'two',place_id:'p',name:'Updated',stage:'New',notes:'Reset'}]);
  assert.equal(result.length,1);assert.equal(result[0].id,'one');assert.equal(result[0].name,'Updated');assert.equal(result[0].stage,'Contacted');assert.equal(result[0].notes,'Keep');assert.deepEqual(result[0].proposals,old.proposals);assert.deepEqual(result[0].payments,old.payments);
});
test('combined filters require every selected criterion',()=>{
  const b={name:'Austin Cafe',category:'Café',rating:4.8,score:'Potential',stage:'New',website_status:'Missing'};
  assert.equal(matches(b,{text:'austin',score:'Potential',rating:'4.5',stage:'New'}),true);assert.equal(matches(b,{text:'austin',score:'Possible'}),false);
});
test('CSV excludes Google content and neutralizes spreadsheet formula injection',()=>{
  const value=csv([{name:'=HYPERLINK("evil")',rating:5,review_count:20,phone:'123',email:'a@b.com'}]);assert.match(value,/"'=HYPERLINK/);assert.equal(value.includes('rating'),false);assert.equal(value.includes('review_count'),false);
});
test('CSV uses independently sourced facts instead of transient Google fields',()=>{
  const value=csv([{name:'Transient Google name',phone:'Google phone',category:'Google category',email:'public@business.com',export_record:{name:'Website title',phone:'',category:'',address:'',zip:''}}]);
  assert.equal(value.includes('Transient Google name'),false);assert.equal(value.includes('Google phone'),false);assert.ok(value.includes('Website title'));assert.ok(value.includes('public@business.com'));
});
test('HTTP reachability alone does not establish low opportunity',()=>assert.equal(assess({website:'https://example.com',website_status:'Working'}).score,'Possible'));
test('unsafe link schemes are rejected',()=>{assert.equal(safeUrl('javascript:alert(1)'), '');assert.equal(safeUrl('data:text/html,test'),'');assert.equal(safeUrl('https://example.com'),'https://example.com/');});
test('payment metrics include recorded USD amounts and refunds',()=>{
  const m=metrics([{phone:'1',email:'x@y.com',score:'Potential',stage:'In Progress',payments:[{amount:100,status:'Paid'},{amount:20,status:'Refunded'},{amount:500,status:'Unpaid'}]}]);assert.equal(m.payments,80);assert.equal(m.projects,1);
});
