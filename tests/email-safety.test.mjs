import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEnvelope,mime,publicUrl,isPublicAddress,websiteAssessment,combineQuery,extractEmail,distanceMiles} from '../supabase/functions/_shared/safety.js';
const settings={mode:'demo',revision:3},account={verified:true,email:'owner@example.com'},business={name:'Client',phone:'123',email:'business@example.com',mode:'demo',stage:'New'},draft={subject:'Proposal',body:'Hello'};
test('demo routing overrides injected recipients and subjects',()=>{
  const envelope=prepareEnvelope(settings,account,business,{...draft,to:'victim@example.com',cc:['victim@example.com'],bcc:['another@example.com'],mode:'live'},3);
  assert.equal(envelope.to,'owner@example.com');assert.equal(envelope.subject,'TEST');assert.deepEqual(envelope.cc,[]);assert.deepEqual(envelope.bcc,[]);assert.match(envelope.body,/Intended business: Client/);assert.match(envelope.body,/Original proposed subject: Proposal/);
});
test('unverified owner never falls back to the business address',()=>{
  for(const a of [null,{email:'owner@example.com',verified:false},{email:'',verified:true}])assert.throws(()=>prepareEnvelope(settings,a,business,draft,3),/verified Gmail/);
});
test('changing mode revision invalidates a pending preview',()=>assert.throws(()=>prepareEnvelope({...settings,revision:4},account,business,draft,3),/Mode changed/));
test('live uses saved business contact and rejects sample/demo leads',()=>{
  const live={mode:'live',revision:3};assert.equal(prepareEnvelope(live,account,{...business,mode:'live'},draft,3).to,business.email);
  for(const b of [business,{...business,mode:'live',sample:true},{...business,mode:'live',email:'sample@test.invalid'}])assert.throws(()=>prepareEnvelope(live,account,b,draft,3),/Sample and demo/);
});
test('Do Not Contact and incomplete contacts block sends',()=>{
  assert.throws(()=>prepareEnvelope(settings,account,{...business,stage:'Do Not Contact'},draft,3),/Do Not Contact/);
  assert.throws(()=>prepareEnvelope(settings,account,{...business,phone:''},draft,3),/Both phone/);
});
test('header injection is rejected and MIME has no CC/BCC headers',()=>{
  assert.throws(()=>prepareEnvelope(settings,account,business,{subject:'Hi\r\nBcc: evil@example.com',body:'x'},3),/header/);
  const envelope=prepareEnvelope(settings,account,business,draft,3);const raw=Buffer.from(mime(envelope,account.email),'base64url').toString();assert.match(raw,/To: owner@example.com/);assert.equal(/\r\n(?:Cc|Bcc):/i.test(raw),false);assert.equal(raw.includes('To: business@example.com'),false);
});
test('SSRF input blocks private hosts, localhost, metadata, and credentials',()=>{
  for(const url of ['http://127.0.0.1','http://169.254.169.254','http://10.0.0.1','http://192.168.1.1','http://172.16.0.1','http://localhost','http://[::1]','https://user:pass@example.com','http://2130706433','https://foo.local'])assert.throws(()=>publicUrl(url));
});
test('DNS checks accept public IPv4/IPv6 and reject internal addresses',()=>{
  for(const ip of ['8.8.8.8','2606:4700:4700::1111'])assert.equal(isPublicAddress(ip),true);
  for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(isPublicAddress(ip),false);
});
test('timeouts and blocks remain uncertain; repeat HTTP errors establish unavailability',()=>{
  for(const status of [0,403,429])assert.equal(websiteAssessment([{status},{status}]).website_status,'Unchecked');assert.equal(websiteAssessment([{status:500},{status:500}]).website_status,'Unavailable');assert.equal(websiteAssessment([{status:500}]).website_status,'Unchecked');assert.equal(websiteAssessment([{status:200}]).website_status,'Working');
});
test('location is combined with business criterion and contact extraction does not invent emails',()=>{
  assert.equal(combineQuery({keyword:'coffee'},'78701'),'coffee in 78701');assert.equal(extractEmail('<a href="mailto:hello@shop.com">Email</a>'),'hello@shop.com');assert.equal(extractEmail('No email listed'),'');assert.equal(distanceMiles({latitude:30,longitude:-97},{latitude:30,longitude:-97}),0);
});
