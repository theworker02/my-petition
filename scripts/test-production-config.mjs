#!/usr/bin/env node
// Offline production configuration tests. Uses only synthetic values.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync,rmSync,existsSync } from 'node:fs';

const environment={
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
  CLOUDFLARE_API_TOKEN:'fixture-token-DO-NOT-USE',
  D1_DATABASE_ID:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  RESEND_API_KEY:'fake-resend-fixture-DO-NOT-USE',
  MAIL_FROM:'My Petition <noreply@example.test>',
  EMAIL_OTP_SECRET:'fixture-otp-secret-00000000000000000000000000',
  AUDIT_HASH_SECRET:'fixture-audit-secret-111111111111111111111',
  TURNSTILE_SITE_KEY:'fixture-site-key',
  TURNSTILE_SECRET:'fixture-turnstile-secret',
  MODERATOR_EMAILS:'moderator@example.test',
  SITE_SUPPORT_EMAIL:'support@example.test',
  PRODUCTION_BASE_URL:'https://example.workers.dev'
};
function run(env){
  return spawnSync(process.execPath,['scripts/prepare-production.mjs'],{env,encoding:'utf8',timeout:15000});
}
function clean(){
  for(const path of ['wrangler.production.jsonc','.secrets.production.json']){
    if(existsSync(path))rmSync(path);
  }
}
try{
  clean();
  const valid=run(environment);
  assert.equal(valid.status,0,'valid synthetic release config rejected: '+valid.stderr);
  const config=JSON.parse(readFileSync('wrangler.production.jsonc','utf8'));
  const secrets=JSON.parse(readFileSync('.secrets.production.json','utf8'));
  assert.equal(config.d1_databases[0].database_id,environment.D1_DATABASE_ID);
  assert.equal(config.vars.PRODUCTION_MODE,'true');
  assert.equal(config.workers_dev,true);
  assert.equal(secrets.AUDIT_HASH_SECRET,environment.AUDIT_HASH_SECRET);
  assert.ok(!JSON.stringify(config).includes(environment.RESEND_API_KEY),'API credentials cannot be embedded in publishable Wrangler config');
  clean();

  const invalidMissing={...environment,RESEND_API_KEY:''};
  assert.notEqual(run(invalidMissing).status,0,'missing email provider key should block deployment');
  const invalidDb={...environment,D1_DATABASE_ID:'00000000-0000-0000-0000-000000000000'};
  assert.notEqual(run(invalidDb).status,0,'placeholder D1 must block deployment');
  const reusedKey={...environment,AUDIT_HASH_SECRET:environment.EMAIL_OTP_SECRET};
  assert.notEqual(run(reusedKey).status,0,'reused audit/OTP key should block deployment');
  const unsafeUrl={...environment,PRODUCTION_BASE_URL:'http://insecure.example.test'};
  assert.notEqual(run(unsafeUrl).status,0,'non-HTTPS production origin must be rejected');
  console.log('PASS: release configuration rejects missing credentials, placeholder D1, reused keys and insecure origins.');
}finally{clean();}
