const apply = process.argv.includes('--apply');
const host = 'faraim.online';
const headers = { 'Content-Type': 'application/json' };

if (process.env.CLOUDFLARE_API_TOKEN) {
  headers.Authorization = `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`;
} else if (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY) {
  headers['X-Auth-Email'] = process.env.CLOUDFLARE_EMAIL;
  headers['X-Auth-Key'] = process.env.CLOUDFLARE_API_KEY;
} else {
  throw new Error('Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY.');
}

async function request(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok || !result.success) {
    throw new Error(`Cloudflare ${method} ${path}: ${JSON.stringify(result.errors)}`);
  }
  return result.result;
}

const zones = await request(`/zones?name=${host}`);
if (zones?.length !== 1) throw new Error(`Expected one Cloudflare zone for ${host}.`);
const zonePath = `/zones/${zones[0].id}`;
const emailObfuscation = await request(`${zonePath}/settings/email_obfuscation`);
const phase = 'http_request_cache_settings';
const ruleset = await request(`${zonePath}/rulesets/phases/${phase}/entrypoint`);
const rule = {
  ref: 'faraim_static_origin_cache',
  description: 'Cache public FAR/AIM static content using origin cache lifetimes',
  expression: `(http.host eq "${host}" and not starts_with(http.request.uri.path, "/cdn-cgi/"))`,
  action: 'set_cache_settings',
  action_parameters: {
    cache: true,
    edge_ttl: { mode: 'bypass_by_default' },
    browser_ttl: { mode: 'respect_origin' },
  },
  enabled: true,
};
const existing = ruleset?.rules?.find((item) => item.ref === rule.ref);

if (!apply) {
  console.log(JSON.stringify({
    host, existing: existing ?? null, proposed: rule,
    emailObfuscation: { existing: emailObfuscation?.value, proposed: 'off' },
  }, null, 2));
} else {
  // Rewriting text inside prerendered reference content breaks React hydration.
  if (emailObfuscation?.value !== 'off') {
    await request(`${zonePath}/settings/email_obfuscation`, 'PATCH', { value: 'off' });
  }
  if (!ruleset) {
    await request(`${zonePath}/rulesets`, 'POST', {
      name: 'FAR/AIM cache settings', kind: 'zone', phase, rules: [rule],
    });
  } else if (existing) {
    await request(`${zonePath}/rulesets/${ruleset.id}/rules/${existing.id}`, 'PATCH', rule);
  } else {
    await request(`${zonePath}/rulesets/${ruleset.id}/rules`, 'POST', rule);
  }
  const updated = await request(`${zonePath}/rulesets/phases/${phase}/entrypoint`);
  const saved = updated?.rules?.find((item) => item.ref === rule.ref);
  if (!saved?.enabled || saved.expression !== rule.expression) {
    throw new Error('Cloudflare did not save the expected cache rule.');
  }
  const savedObfuscation = await request(`${zonePath}/settings/email_obfuscation`);
  if (savedObfuscation?.value !== 'off') throw new Error('Cloudflare email rewriting is still enabled.');
  console.log(`Verified cache rule ${saved.id} for ${host}.`);
  console.log('Verified HTML email rewriting is disabled for React hydration.');
}
