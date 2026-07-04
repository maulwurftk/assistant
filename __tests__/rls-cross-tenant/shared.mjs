// Gemeinsame Helfer für die RLS-Cross-Tenant-Tests (kein Testfile).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);

export const PW = 'Rls-Test-1234!';

export const USERS = {
  aAdmin:  { email: 'test-a-admin@example.com',  role: 'admin',     org: 'demo-org-a', name: 'Test Admin A' },
  aAssist: { email: 'test-a-assist@example.com', role: 'assistant', org: 'demo-org-a', name: 'Test Assist A' },
  bAdmin:  { email: 'test-b-admin@example.com',  role: 'admin',     org: 'demo-org-b', name: 'Test Admin B' },
  bAssist: { email: 'test-b-assist@example.com', role: 'assistant', org: 'demo-org-b', name: 'Test Assist B' },
};

export function serviceClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Staging-Wächter: bricht ab, wenn die Ziel-DB nach Prod aussieht.
export async function assertStaging(svc) {
  const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const fremd = data.users.filter(
    (u) => u.email && !/^demo-.*@example\.com$/.test(u.email) && !/^test-.*@example\.com$/.test(u.email)
  );
  if (fremd.length > 0) {
    throw new Error(
      'Nicht-Demo-User gefunden (' + fremd.map((u) => u.email).join(', ') + ') — sieht nach PROD aus. Abbruch.'
    );
  }
  return data.users;
}

export async function ensureTestUsers(svc, orgs) {
  const existing = await assertStaging(svc);
  const ids = {};
  for (const [k, u] of Object.entries(USERS)) {
    let id = existing.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await svc.auth.admin.createUser({
        email: u.email, password: PW, email_confirm: true,
      });
      if (error) throw new Error('createUser ' + u.email + ': ' + error.message);
      id = data.user.id;
    }
    ids[k] = id;
    const { error: pe } = await svc.from('profiles').upsert({
      id, email: u.email, full_name: u.name, role: u.role, tenant_id: orgs[u.org], active: true,
    });
    if (pe) throw new Error('profiles upsert ' + u.email + ': ' + pe.message);
  }
  return ids;
}

export async function getOrgs(svc) {
  const { data, error } = await svc.from('organizations').select('id, slug')
    .in('slug', ['demo-org-a', 'demo-org-b']);
  if (error) throw error;
  const orgs = Object.fromEntries(data.map((o) => [o.slug, o.id]));
  if (!orgs['demo-org-a'] || !orgs['demo-org-b']) {
    throw new Error('Demo-Orgs fehlen — staging/0005 einspielen');
  }
  return orgs;
}

export async function signedInClient(userKey) {
  const u = USERS[userKey];
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: PW });
  if (error) throw new Error('Login fehlgeschlagen für ' + u.email + ': ' + error.message);
  return c;
}
