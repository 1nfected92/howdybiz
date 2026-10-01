export const VALID_STAGES = ['New','Reviewing','Qualified','Email Drafted','Contacted','Proposal Sent','Follow-up','Negotiating','Accepted','In Progress','Completed','Not Interested','On Hold','Do Not Contact'];
export function cleanText(value,max=2000){ if(typeof value!=='string'||value.length>max)throw Error('Invalid text field.');return value; }
export function validEmail(value){return typeof value==='string'&&value.length<=254&&/^[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+$/.test(value);}
export function prepareEnvelope(settings, account, business, draft, expectedRevision) {
  if(settings.revision!==expectedRevision)throw Error('Mode changed. Prepare a new preview.');
  if(!account?.verified||!validEmail(account.email))throw Error('A verified Gmail account is required.');
  if(!business.phone?.trim()||!validEmail(business.email))throw Error('Both phone and public email are required.');
  if(business.stage==='Do Not Contact')throw Error('Business is marked Do Not Contact.');
  const subject=cleanText(draft.subject,180).trim(),body=cleanText(draft.body,20000).trim();
  if(!subject||!body||/[\r\n]/.test(subject))throw Error('Subject and body are required; header line breaks are forbidden.');
  if(settings.mode!=='demo'&&settings.mode!=='live')throw Error('Invalid server mode.');
  if(settings.mode==='live'&&(business.sample||business.email.endsWith('.invalid')||business.mode!=='live'))throw Error('Sample and demo records cannot receive live outreach.');
  return {mode:settings.mode,revision:settings.revision,to:settings.mode==='demo'?account.email:business.email,subject:settings.mode==='demo'?'TEST':subject,body:settings.mode==='demo'?`DEMO TEST — no outreach sent to the business.\nIntended business: ${cleanText(business.name,200)}\nIntended recipient: ${business.email}\nOriginal proposed subject: ${subject}\n\n${body}`:body,cc:[],bcc:[]};
}
export function mime(envelope,from){
  if(!validEmail(envelope.to)||!validEmail(from)||/[\r\n]/.test(envelope.subject))throw Error('Invalid mail headers.');
  const encode=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const encodedBody=encode(envelope.body).match(/.{1,76}/g)?.join('\r\n')||'';
  const text=`From: ${from}\r\nTo: ${envelope.to}\r\nSubject: =?UTF-8?B?${encode(envelope.subject)}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}`;
  return encode(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function isPublicHost(host){
  const h=host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if(!h.includes('.')||h.includes(':')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.localhost')||h.endsWith('.invalid')||h==='localhost')return false;
  if(/^\d+\.\d+\.\d+\.\d+$/.test(h)){const [a,b]=h.split('.').map(Number);if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19))return false;}
  return true;
}
export function isPublicAddress(address){
  const value=address.toLowerCase();
  if(value.includes(':')){
    // Permit only global-unicast IPv6; exclude documentation and local ranges.
    const first=parseInt(value.split(':')[0],16);
    return first>=0x2000&&first<=0x3fff&&!value.startsWith('2001:db8:');
  }
  return /^\d+\.\d+\.\d+\.\d+$/.test(value)&&isPublicHost(value)&&!/^192\.0\.(0|2)\./.test(value)&&!/^198\.51\.100\./.test(value)&&!/^203\.0\.113\./.test(value);
}
export function publicUrl(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port))||!isPublicHost(u.hostname))throw Error('Only public business website URLs are allowed.');return u;}
export function distanceMiles(a,b){const rad=n=>n*Math.PI/180;const dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;return 3958.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
export function combineQuery(query,zone){return [cleanText(query.keyword,120).trim(),cleanText(zone,150).trim()].filter(Boolean).join(' in ');}
export function extractEmail(html){const emails=[...html.matchAll(/(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map(m=>m[1]);return emails.find(v=>validEmail(v)&&!/(example|sentry|wixpress|schema\.org|test)\./i.test(v)&&!v.endsWith('.png')&&!v.endsWith('.jpg'))||'';}
export function websiteAssessment(checks,html=''){
  if(!checks.length||checks.every(c=>c.status===403||c.status===429||!c.status))return {website_status:'Unchecked',findings:[],summary:'The website could not be reliably evaluated. Timeouts or automated-access blocks do not establish an outage.'};
  const good=checks.find(c=>c.status>=200&&c.status<400);
  if(!good)return checks.length>=2&&checks.every(c=>c.status>=400&&c.status!==403&&c.status!==429)?{website_status:'Unavailable',findings:['Two checks returned HTTP errors. Confirm the website condition with the owner.'],summary:'Repeated HTTP errors observed. This does not prove the business lacks a website.'}:{website_status:'Unchecked',findings:[],summary:'Website condition remains uncertain.'};
  const findings=[];if(html&&!/<meta[^>]+name=["']viewport["']/i.test(html))findings.push('No viewport meta tag was observed in the returned HTML; visually review mobile usability.');
  return {website_status:'Working',findings,summary:'The website returned a successful HTTP response. Booking, accessibility and conversion quality require manual review.'};
}
