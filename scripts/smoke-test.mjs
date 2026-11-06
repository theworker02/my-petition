/**
 * My Petition API smoke tests against a real local Cloudflare Worker + D1.
 * Run after "npm run build" and "npm run db:local".
 * Uses only Node.js built-ins and never calls external email providers.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const port=8789;
const origin='http://127.0.0.1:'+port;
const worker=spawn('node_modules/.bin/wrangler',['dev','--local','--port',String(port),'--ip','127.0.0.1'],{
  stdio:['ignore','pipe','pipe'],detached:true
});
let output='';
worker.stdout.on('data',part=>{output+=part.toString();if(output.length>20000)output=output.slice(-15000);});
worker.stderr.on('data',part=>{output+=part.toString();if(output.length>20000)output=output.slice(-15000);});
let exited=false;
worker.on('exit',()=>{exited=true;});

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function request(path,{method='GET',body,cookie}={}){
  const headers={Origin:origin};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  const setCookie=response.headers.get('set-cookie')||'';
  const guest=setCookie.match(/mp_guest=[a-f0-9]{64}/)?.[0];
  const session=setCookie.match(/mp_session=[a-f0-9]{64}/)?.[0];
  return {status:response.status,data,cookie:session??guest??cookie??''};
}
function status(result,expected,label){
  assert.equal(result.status,expected,label+' failed: '+JSON.stringify(result.data));
}
async function ready(){
  for(let i=0;i<100;i++){
    if(exited)throw new Error('Worker exited unexpectedly:\n'+output);
    try{
      const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(800)});
      if(r.ok)return;
    }catch{}
    await sleep(250);
  }
  throw new Error('Worker startup timed out:\n'+output);
}
async function run(){
  await ready();
  const health=await request('/api/health');
  status(health,200,'Health endpoint');
  assert.equal(health.data.product,'My Petition');

  const nonce=randomUUID().slice(0,8);
  const proposal={
    title:'Add more recycling bins in '+nonce+' neighborhood',
    description:'Please consider a balanced proposal for additional recycling bins, including maintenance responsibilities, placement and municipal cost estimates.',
    category:'Environment',location:'Test City',kind:'petition',authorName:'Smoke Test Organizer'
  };
  let created=await request('/api/proposals',{method:'POST',body:proposal});
  status(created,201,'Guest creates petition');
  assert.ok(created.cookie.startsWith('mp_guest='));
  const slug=created.data.slug;
  const detailPath='/api/proposals/'+encodeURIComponent(slug);
  let details=await request(detailPath,{cookie:created.cookie});
  status(details,200,'Guest reads petition');
  assert.equal(details.data.isAuthor,true);
  assert.equal(details.data.proposal.support_count,0);
  assert.equal(details.data.proposal.oppose_count,0);
  assert.equal(details.data.proposal.signature_count,0);

  let unauthorizedSave=await request(detailPath+'/save',{method:'POST',body:{saved:true},cookie:created.cookie});
  status(unauthorizedSave,401,'Saving requires registered account');
  let sign=await request(detailPath+'/sign',{method:'POST',cookie:created.cookie,body:{signerName:'Demo Signer',consent:true}});
  status(sign,403,'Unverified guests cannot e-sign');
  const emailSend=await request('/api/verification/email/request',{method:'POST',cookie:created.cookie,body:{email:'smoke-'+nonce+'@example.test'}});
  status(emailSend,503,'Unconfigured email service fails safely');

  const malformedVote=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'maybe',showName:false}});
  status(malformedVote,400,'Invalid vote rejected');
  let vote=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'support',showName:false}});
  status(vote,200,'Anonymous-display guest vote');
  details=await request(detailPath,{cookie:created.cookie});
  assert.equal(details.data.proposal.support_count,1);
  assert.equal(details.data.proposal.oppose_count,0);
  assert.equal(details.data.participants[0].display_name,null);
  assert.equal(details.data.myVote.stance,'support');

  const rapidChange=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'oppose',showName:true,publicName:'Example Voter'}});
  status(rapidChange,429,'Rapid vote changes throttled');
  await sleep(2200);
  vote=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'oppose',showName:true,publicName:'Example Voter'}});
  status(vote,200,'Vote update');
  details=await request(detailPath,{cookie:created.cookie});
  assert.equal(details.data.proposal.support_count,0);
  assert.equal(details.data.proposal.oppose_count,1);
  assert.equal(details.data.participants[0].display_name,'Example Voter');

  const comment=await request(detailPath+'/comments',{method:'POST',cookie:created.cookie,body:{body:'Please consider accessibility too.',publicName:'Example Organizer'}});
  status(comment,201,'Guest public comment');
  details=await request(detailPath,{cookie:created.cookie});
  assert.equal(details.data.comments[0].display_name,'Example Organizer');
  const firstReport=await request('/api/reports',{method:'POST',cookie:created.cookie,body:{targetType:'comment',targetId:details.data.comments[0].id,reason:'other',details:'Smoke test report'}});
  status(firstReport,201,'Report content');
  const secondReport=await request('/api/reports',{method:'POST',cookie:created.cookie,body:{targetType:'comment',targetId:details.data.comments[0].id,reason:'other'}});
  status(secondReport,409,'Duplicate report blocked');
  status(await request('/api/moderation/queue',{cookie:created.cookie}),403,'Moderator queue requires privileges');

  const list=await request('/api/proposals?q='+encodeURIComponent(nonce));
  status(list,200,'Search proposals');
  assert.ok(list.data.proposals.some(p=>p.slug===slug));
  const activity=await request('/api/me/activity',{cookie:created.cookie});
  assert.ok(activity.data.created.some(p=>p.slug===slug));
  assert.ok(activity.data.voted.some(p=>p.slug===slug));

  const locationProposal=await request('/api/proposals',{method:'POST',cookie:created.cookie,body:{
    ...proposal,title:'Local participation check '+nonce,localOnly:true,locality:'Example Town',region:'Connecticut'
  }});
  status(locationProposal,201,'Guest creates local-only poll');
  const localVote=await request('/api/proposals/'+locationProposal.data.slug+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'support',showName:false}});
  status(localVote,403,'Local-only voting gate');
  const localRequest=await request('/api/verification/location/request',{method:'POST',cookie:created.cookie,body:{locality:'Example Town',region:'Connecticut',postalCode:'06400'}});
  status(localRequest,403,'Email required before local verification');

  const newAccount=await request('/api/auth/register',{method:'POST',body:{email:'smoke-'+nonce+'@example.test',displayName:'Saved Proposal Tester',password:'long-test-password-32-'+nonce}});
  status(newAccount,201,'Create an optional account');
  assert.ok(newAccount.cookie.startsWith('mp_session='));
  const saved=await request(detailPath+'/save',{method:'POST',cookie:newAccount.cookie,body:{saved:true}});
  status(saved,200,'Save proposal to account');
  assert.equal(saved.data.saved,true);
  const accountActivity=await request('/api/me/activity',{cookie:newAccount.cookie});
  assert.ok(accountActivity.data.saved.some(p=>p.slug===slug),'Saved proposal visible to account');
  const loggedOut=await request('/api/auth/logout',{method:'POST',cookie:newAccount.cookie,body:{}});
  status(loggedOut,200,'Log out');
  status(await request(detailPath+'/save',{method:'POST',cookie:newAccount.cookie,body:{saved:true}}),401,'Logged-out session refused');

  const close=await request(detailPath+'/close',{method:'POST',cookie:created.cookie,body:{}});
  status(close,200,'Guest creator closes petition');
  details=await request(detailPath);
  assert.equal(details.data.proposal.is_open,false);
  status(await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'support',showName:false}}),409,'Closed petition blocks new votes');
  console.log('PASS: 23 API assertions and end-to-end guest, vote, signature gate, moderation, local eligibility, saved proposal, logout, and closure workflows.');
}
try{await run();}
catch(error){console.error(error);console.error('Last Worker output:\n'+output.slice(-3500));process.exitCode=1;}
finally{
  try{process.kill(-worker.pid,'SIGTERM');}catch{worker.kill('SIGTERM');}
}
