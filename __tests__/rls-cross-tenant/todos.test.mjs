// ============================================================================
// Cross-Tenant-Isolationstest: To-do-Feature (0014_todos.sql; Architektur
// docs/todo-feature-architektur.md §4 RLS-Matrix, §7 Entscheidungen)
//
// Tabellen: todo_templates, todo_checks, todos + RPC complete_todo(p_id, p_note).
// Läuft gegen die DB aus .env.local — NUR Staging (eingebauter Wächter).
//
//   npm run test:rls   (bzw. node __tests__/rls-cross-tenant/todos.test.mjs)
//
// Legt idempotent an: Testslots je Org (Muster calendar-slots.test.mjs),
// je Org ein aktives Template (per_shift) + ein weekly-Template.
// Cleanup am Ende (Service-Client, FK-Reihenfolge: todos/todo_checks vor
// todo_templates vor calendar_slots).
// ============================================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serviceClient, getOrgs, ensureTestUsers, signedInClient } from './shared.mjs';

const svc = serviceClient();
let orgs, ids, A, B; // A/B = { org, admin, assist }
const clients = {};

const MARK = 'rls14';

// Fixture-IDs je Tenant
const slots = {};        // 'A'|'B' -> calendar_slot id
const templates = {};    // 'A'|'B' -> { perShift, weekly, assigned }
const createdChecks = []; // ids, die während der Tests entstehen (Cleanup)
const createdTodos = [];  // ids, die während der Tests entstehen (Cleanup)

before(async () => {
  orgs = await getOrgs(svc);
  ids = await ensureTestUsers(svc, orgs);
  A = { tag: 'A', org: orgs['demo-org-a'], admin: ids.aAdmin, assist: ids.aAssist };
  B = { tag: 'B', org: orgs['demo-org-b'], admin: ids.bAdmin, assist: ids.bAssist };

  // ── Marker-Slots je Tenant (idempotent über Titel, Muster calendar-slots) ──
  for (const T of [A, B]) {
    const title = MARK + '-Testslot ' + T.tag;
    const { data: found } = await svc.from('calendar_slots').select('id')
      .eq('title', title).eq('tenant_id', T.org).limit(1);
    if (found?.length) { slots[T.tag] = found[0].id; continue; }
    const { data: ins, error } = await svc.from('calendar_slots').insert({
      date: '2026-08-10', start_time: '09:00', end_time: '11:00',
      title, status: 'open', created_by: T.admin, tenant_id: T.org,
    }).select('id').single();
    if (error) throw error;
    slots[T.tag] = ins.id;
  }

  // ── Templates je Tenant (idempotent über Titel) ─────────────────────────────
  // ACHTUNG: current_tenant() ist für Service-Role NULL -> tenant_id IMMER explizit setzen.
  for (const T of [A, B]) {
    templates[T.tag] = {};

    // per_shift, aktiv, für alle (assignee_id null)
    {
      const title = MARK + '-per-shift ' + T.tag;
      const { data: found } = await svc.from('todo_templates').select('id')
        .eq('title', title).eq('tenant_id', T.org).limit(1);
      if (found?.length) {
        templates[T.tag].perShift = found[0].id;
      } else {
        const { data: ins, error } = await svc.from('todo_templates').insert({
          title, recurrence: 'per_shift', active: true, tenant_id: T.org,
        }).select('id').single();
        if (error) throw error;
        templates[T.tag].perShift = ins.id;
      }
    }

    // weekly, aktiv, für alle
    {
      const title = MARK + '-weekly ' + T.tag;
      const { data: found } = await svc.from('todo_templates').select('id')
        .eq('title', title).eq('tenant_id', T.org).limit(1);
      if (found?.length) {
        templates[T.tag].weekly = found[0].id;
      } else {
        const { data: ins, error } = await svc.from('todo_templates').insert({
          title, recurrence: 'weekly', weekday: 1, active: true, tenant_id: T.org,
        }).select('id').single();
        if (error) throw error;
        templates[T.tag].weekly = ins.id;
      }
    }

    // per_shift, aktiv, zugewiesen an den jeweiligen Tenant-Assistenten
    {
      const title = MARK + '-assigned ' + T.tag;
      const { data: found } = await svc.from('todo_templates').select('id')
        .eq('title', title).eq('tenant_id', T.org).limit(1);
      if (found?.length) {
        templates[T.tag].assigned = found[0].id;
      } else {
        const { data: ins, error } = await svc.from('todo_templates').insert({
          title, recurrence: 'per_shift', active: true, assignee_id: T.assist, tenant_id: T.org,
        }).select('id').single();
        if (error) throw error;
        templates[T.tag].assigned = ins.id;
      }
    }
  }

  clients.aAdmin = await signedInClient('aAdmin');
  clients.aAssist = await signedInClient('aAssist');
  clients.bAdmin = await signedInClient('bAdmin');
  clients.bAssist = await signedInClient('bAssist');
});

after(async () => {
  // FK-Reihenfolge: todo_checks vor todo_templates; todos unabhängig, aber
  // zuerst räumen falls Referenzen auf Templates/Slots bestehen (defensiv).
  if (createdChecks.length) {
    await svc.from('todo_checks').delete().in('id', createdChecks);
  }
  if (createdTodos.length) {
    await svc.from('todos').delete().in('id', createdTodos);
  }
  await svc.from('todo_checks').delete().like('note', MARK + '%');
  await svc.from('todos').delete().like('title', MARK + '%');
  for (const T of [A, B]) {
    const tpls = Object.values(templates[T.tag] || {});
    if (tpls.length) await svc.from('todo_templates').delete().in('id', tpls);
  }
  const slotIds = Object.values(slots);
  if (slotIds.length) await svc.from('calendar_slots').delete().in('id', slotIds);
});

// ============================================================================
// 1) Cross-Tenant-Isolation lesen
// ============================================================================

test('todo_templates: Read-Isolation (Admin A sieht keine B-Templates)', async () => {
  const { data, error } = await clients.aAdmin.from('todo_templates').select('id, tenant_id');
  assert.equal(error, null, error?.message);
  assert.ok(data.length > 0, 'Admin A muss eigene Templates sehen');
  assert.ok(data.every((r) => r.tenant_id === A.org), 'fremde tenant_id sichtbar!');
  assert.ok(!Object.values(templates.B).some((id) => data.some((r) => r.id === id)), 'B-Template für A sichtbar!');
});

test('todo_templates: Read-Isolation (Assistent A sieht keine B-Templates)', async () => {
  const { data, error } = await clients.aAssist.from('todo_templates').select('id, tenant_id');
  assert.equal(error, null, error?.message);
  assert.ok(data.every((r) => r.tenant_id === A.org), 'fremde tenant_id sichtbar!');
  assert.ok(!Object.values(templates.B).some((id) => data.some((r) => r.id === id)), 'B-Template für A-Assistent sichtbar!');
});

test('todos: Read-Isolation (Admin/Assistent A sehen keine B-Todos)', async () => {
  const { data: bTodo, error: ie } = await svc.from('todos').insert({
    title: MARK + '-read-iso-B', tenant_id: B.org, created_by: B.admin,
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdTodos.push(bTodo.id);

  for (const key of ['aAdmin', 'aAssist']) {
    const { data, error } = await clients[key].from('todos').select('id, tenant_id');
    assert.equal(error, null, error?.message);
    assert.ok(data.every((r) => r.tenant_id === A.org), key + ': fremde tenant_id sichtbar!');
    assert.ok(!data.some((r) => r.id === bTodo.id), key + ': B-Todo sichtbar!');
  }
});

test('todo_checks: Read-Isolation (Admin/Assistent A sehen keine B-Checks)', async () => {
  const { data: bCheck, error: ie } = await svc.from('todo_checks').insert({
    tenant_id: B.org, template_id: templates.B.perShift, slot_id: slots.B,
    done_by: B.assist, note: MARK + '-read-iso-B',
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdChecks.push(bCheck.id);

  for (const key of ['aAdmin', 'aAssist']) {
    const { data, error } = await clients[key].from('todo_checks').select('id, tenant_id');
    assert.equal(error, null, error?.message);
    assert.ok(data.every((r) => r.tenant_id === A.org), key + ': fremde tenant_id sichtbar!');
    assert.ok(!data.some((r) => r.id === bCheck.id), key + ': B-Check sichtbar!');
  }
});

// ============================================================================
// 2) todo_templates: Schreibrechte
// ============================================================================

test('todo_templates: Assistent kann nicht inserten (42501)', async () => {
  const { data, error } = await clients.aAssist.from('todo_templates').insert({
    title: MARK + '-assist-insert', recurrence: 'per_shift', tenant_id: A.org,
  }).select('id');
  if (data?.length) await svc.from('todo_templates').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Assistent konnte Template anlegen!');
  assert.equal(error.code, '42501');
});

test('todo_templates: Assistent kann nicht updaten (0 rows)', async () => {
  const { data, error } = await clients.aAssist.from('todo_templates')
    .update({ title: 'gekapert' }).eq('id', templates.A.perShift).select('id');
  assert.equal(error, null);
  assert.equal(data.length, 0, 'Assistent konnte Template updaten!');
  const { data: check } = await svc.from('todo_templates').select('title').eq('id', templates.A.perShift).single();
  assert.equal(check.title, MARK + '-per-shift A');
});

test('todo_templates: Assistent kann nicht löschen (0 rows)', async () => {
  const { data, error } = await clients.aAssist.from('todo_templates')
    .delete().eq('id', templates.A.perShift).select('id');
  assert.equal(error, null);
  assert.equal(data.length, 0, 'Assistent konnte Template löschen!');
  const { data: check } = await svc.from('todo_templates').select('id').eq('id', templates.A.perShift);
  assert.equal(check.length, 1, 'Template wurde gelöscht!');
});

test('todo_templates: Admin A kann nicht mit tenant_id von Org B inserten (42501)', async () => {
  const { data, error } = await clients.aAdmin.from('todo_templates').insert({
    title: MARK + '-cross-tenant', recurrence: 'per_shift', tenant_id: B.org,
  }).select('id');
  if (data?.length) await svc.from('todo_templates').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Insert in fremden Tenant wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

test('todo_templates: Composite-FK — assignee_id eines Org-B-Profils scheitert (23503)', async () => {
  const { data, error } = await clients.aAdmin.from('todo_templates').insert({
    title: MARK + '-fk-einbruch', recurrence: 'per_shift', tenant_id: A.org, assignee_id: B.assist,
  }).select('id');
  if (data?.length) await svc.from('todo_templates').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Cross-Tenant-assignee_id wurde NICHT abgelehnt!');
  assert.equal(error.code, '23503');
});

// ============================================================================
// 3) todo_checks
// ============================================================================

test('todo_checks: Assistent kann eigenen Check inserten (per_shift, Template aktiv, assignee null)', async () => {
  const { data, error } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.perShift, slot_id: slots.A,
    done_by: A.assist, note: MARK + '-own-check',
  }).select('id').single();
  assert.equal(error, null, error?.message);
  createdChecks.push(data.id);
});

test('todo_checks: Assistent kann eigenen Check für ihm zugewiesenes Template inserten', async () => {
  // eigener Slot, aber anderes Template (assigned), um Unique-Konflikt mit obigem Test zu vermeiden
  const { data: freshSlot, error: se } = await svc.from('calendar_slots').insert({
    date: '2026-08-11', start_time: '09:00', end_time: '11:00',
    title: MARK + '-assigned-slot A', status: 'open', created_by: A.admin, tenant_id: A.org,
  }).select('id').single();
  assert.equal(se, null, se?.message);

  const { data, error } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.assigned, slot_id: freshSlot.id,
    done_by: A.assist, note: MARK + '-assigned-check',
  }).select('id').single();
  assert.equal(error, null, error?.message);
  createdChecks.push(data.id);

  await svc.from('calendar_slots').delete().eq('id', freshSlot.id);
});

test('todo_checks: Insert mit done_by = anderer User scheitert (42501)', async () => {
  const { data, error } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.perShift, slot_id: slots.A,
    done_by: A.admin, note: MARK + '-fremd-done-by',
  }).select('id');
  if (data?.length) await svc.from('todo_checks').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Insert mit fremdem done_by wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

test('todo_checks: Insert mit confirmed_by/confirmed_at gesetzt scheitert (42501)', async () => {
  const { data, error } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.perShift, slot_id: slots.A,
    done_by: A.assist, note: MARK + '-self-confirm',
    confirmed_by: A.assist, confirmed_at: new Date().toISOString(),
  }).select('id');
  if (data?.length) await svc.from('todo_checks').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Insert mit gesetzter Abnahme wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

test('todo_checks: Insert für Template mit assignee_id = anderer scheitert (42501)', async () => {
  // Ein ASSISTENT darf kein Template abhaken, das jemand anderem zugewiesen ist
  // (tc_assistant_insert: t.assignee_id is null or t.assignee_id = auth.uid()).
  // Achtung: Admins fallen unter tc_admin_all (Policies sind OR-verknüpft) und
  // dürfen absichtlich alles — der Versuch muss daher vom Assistenten kommen.
  // Template wird hier auf A.admin zugewiesen, A.assist versucht abzuhaken.
  const { data: foreignTpl, error: te } = await svc.from('todo_templates').insert({
    tenant_id: A.org, title: MARK + '-assigned-to-admin A',
    recurrence: 'per_shift', assignee_id: A.admin, active: true,
  }).select('id').single();
  assert.equal(te, null, te?.message);

  const { data: freshSlot, error: se } = await svc.from('calendar_slots').insert({
    date: '2026-08-12', start_time: '09:00', end_time: '11:00',
    title: MARK + '-assigned-slot2 A', status: 'open', created_by: A.admin, tenant_id: A.org,
  }).select('id').single();
  assert.equal(se, null, se?.message);

  const { data, error } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: foreignTpl.id, slot_id: freshSlot.id,
    done_by: A.assist, note: MARK + '-wrong-assignee',
  }).select('id');
  if (data?.length) await svc.from('todo_checks').delete().in('id', data.map((d) => d.id));
  await svc.from('calendar_slots').delete().eq('id', freshSlot.id);
  await svc.from('todo_templates').delete().eq('id', foreignTpl.id);
  assert.ok(error, 'Insert für fremd-zugewiesenes Template wurde NICHT abgelehnt!');
  assert.equal(error.code, '42501');
});

test('todo_checks: Doppel-Abhaken gleicher Template+slot scheitert (23505)', async () => {
  // aus obigem "eigenen Check inserten"-Test existiert bereits ein Check für
  // (templates.A.perShift, slots.A) von A.assist. Ein zweiter Insert mit demselben
  // Template+Slot (auch mit anderem done_by via Service) muss am Unique-Index scheitern.
  const { data, error } = await svc.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.perShift, slot_id: slots.A,
    done_by: A.admin, note: MARK + '-dup-slot',
  }).select('id');
  if (data?.length) await svc.from('todo_checks').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Doppel-Abhaken (Template+Slot) wurde NICHT abgelehnt!');
  assert.equal(error.code, '23505');
});

test('todo_checks: Doppel-Abhaken gleicher Template+check_date (slot null) scheitert (23505)', async () => {
  const checkDate = '2026-08-13';
  const { data: first, error: fe } = await svc.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.weekly, slot_id: null, check_date: checkDate,
    done_by: A.assist, note: MARK + '-weekly-first',
  }).select('id').single();
  assert.equal(fe, null, fe?.message);
  createdChecks.push(first.id);

  const { data, error } = await svc.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.weekly, slot_id: null, check_date: checkDate,
    done_by: A.admin, note: MARK + '-weekly-dup',
  }).select('id');
  if (data?.length) await svc.from('todo_checks').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Doppel-Abhaken (Template+Datum) wurde NICHT abgelehnt!');
  assert.equal(error.code, '23505');
});

test('todo_checks: Assistent kann eigenen unbestätigten Check löschen', async () => {
  const { data: freshSlot, error: se } = await svc.from('calendar_slots').insert({
    date: '2026-08-14', start_time: '09:00', end_time: '11:00',
    title: MARK + '-delete-slot A', status: 'open', created_by: A.admin, tenant_id: A.org,
  }).select('id').single();
  assert.equal(se, null, se?.message);

  const { data: check, error: ce } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.perShift, slot_id: freshSlot.id,
    done_by: A.assist, note: MARK + '-to-delete',
  }).select('id').single();
  assert.equal(ce, null, ce?.message);

  const { data: del, error: de } = await clients.aAssist.from('todo_checks')
    .delete().eq('id', check.id).select('id');
  assert.equal(de, null, de?.message);
  assert.equal(del.length, 1, 'Assistent konnte eigenen unbestätigten Check nicht löschen!');

  await svc.from('calendar_slots').delete().eq('id', freshSlot.id);
});

test('todo_checks: Admin kann Check bestätigen; danach kann Assistent ihn nicht mehr löschen (0 rows)', async () => {
  const { data: freshSlot, error: se } = await svc.from('calendar_slots').insert({
    date: '2026-08-15', start_time: '09:00', end_time: '11:00',
    title: MARK + '-confirm-slot A', status: 'open', created_by: A.admin, tenant_id: A.org,
  }).select('id').single();
  assert.equal(se, null, se?.message);

  const { data: check, error: ce } = await clients.aAssist.from('todo_checks').insert({
    tenant_id: A.org, template_id: templates.A.perShift, slot_id: freshSlot.id,
    done_by: A.assist, note: MARK + '-to-confirm',
  }).select('id').single();
  assert.equal(ce, null, ce?.message);
  createdChecks.push(check.id);

  const { data: upd, error: ue } = await clients.aAdmin.from('todo_checks')
    .update({ confirmed_by: A.admin, confirmed_at: new Date().toISOString() })
    .eq('id', check.id).select('id, confirmed_by');
  assert.equal(ue, null, ue?.message);
  assert.equal(upd.length, 1, 'Admin konnte Check nicht bestätigen!');
  assert.equal(upd[0].confirmed_by, A.admin);

  const { data: del, error: de } = await clients.aAssist.from('todo_checks')
    .delete().eq('id', check.id).select('id');
  assert.equal(de, null, de?.message);
  assert.equal(del.length, 0, 'Assistent konnte bestätigten Check trotzdem löschen!');
  const { data: still } = await svc.from('todo_checks').select('id').eq('id', check.id);
  assert.equal(still.length, 1, 'Bestätigter Check wurde gelöscht!');

  await svc.from('calendar_slots').delete().eq('id', freshSlot.id);
});

// ============================================================================
// 4) todos
// ============================================================================

test('todos: Assistent kann nicht direkt inserten (42501)', async () => {
  const { data, error } = await clients.aAssist.from('todos').insert({
    title: MARK + '-assist-direct-insert', tenant_id: A.org, created_by: A.assist,
  }).select('id');
  if (data?.length) await svc.from('todos').delete().in('id', data.map((d) => d.id));
  assert.ok(error, 'Assistent konnte todo direkt anlegen!');
  assert.equal(error.code, '42501');
});

test('todos: Assistent kann nicht direkt updaten (0 rows)', async () => {
  const { data: todo, error: ie } = await svc.from('todos').insert({
    title: MARK + '-direct-update-target', tenant_id: A.org, created_by: A.admin,
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdTodos.push(todo.id);

  const { data, error } = await clients.aAssist.from('todos')
    .update({ status: 'done', done_by: A.assist, done_at: new Date().toISOString() })
    .eq('id', todo.id).select('id');
  assert.equal(error, null);
  assert.equal(data.length, 0, 'Assistent konnte todo direkt updaten!');
  const { data: check } = await svc.from('todos').select('status').eq('id', todo.id).single();
  assert.equal(check.status, 'open', 'todo-Status wurde direkt verändert!');
});

test('todos: Admin legt Todo an (ok)', async () => {
  const { data, error } = await clients.aAdmin.from('todos').insert({
    title: MARK + '-admin-created', tenant_id: A.org, created_by: A.admin,
  }).select('id').single();
  assert.equal(error, null, error?.message);
  assert.ok(data.id);
  createdTodos.push(data.id);
});

test('complete_todo: Assistent erledigt unzugewiesenes Todo (ok)', async () => {
  const { data: todo, error: ie } = await svc.from('todos').insert({
    title: MARK + '-rpc-unassigned', tenant_id: A.org, created_by: A.admin,
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdTodos.push(todo.id);

  const { data, error } = await clients.aAssist.rpc('complete_todo', { p_id: todo.id, p_note: MARK + '-done' });
  assert.equal(error, null, error?.message);
  assert.equal(data.status, 'done');

  const { data: check } = await svc.from('todos').select('status, done_by, note').eq('id', todo.id).single();
  assert.equal(check.status, 'done');
  assert.equal(check.done_by, A.assist);
  assert.equal(check.note, MARK + '-done');
});

test('complete_todo: Todo das jemand anderem zugewiesen ist scheitert', async () => {
  const { data: todo, error: ie } = await svc.from('todos').insert({
    title: MARK + '-rpc-assigned-other', tenant_id: A.org, created_by: A.admin, assignee_id: A.admin,
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdTodos.push(todo.id);

  const { error } = await clients.aAssist.rpc('complete_todo', { p_id: todo.id });
  assert.ok(error, 'Assistent konnte fremd zugewiesenes todo erledigen!');
  assert.match(error.message, /assigned to someone else/);

  const { data: check } = await svc.from('todos').select('status').eq('id', todo.id).single();
  assert.equal(check.status, 'open', 'todo wurde trotz Fehlermeldung erledigt!');
});

test('complete_todo: bereits erledigtes Todo scheitert', async () => {
  const { data: todo, error: ie } = await svc.from('todos').insert({
    title: MARK + '-rpc-already-done', tenant_id: A.org, created_by: A.admin,
    status: 'done', done_by: A.admin, done_at: new Date().toISOString(),
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdTodos.push(todo.id);

  const { error } = await clients.aAssist.rpc('complete_todo', { p_id: todo.id });
  assert.ok(error, 'Bereits erledigtes todo konnte nochmal erledigt werden!');
  assert.match(error.message, /not open/);
});

test('complete_todo: Todo von Org B scheitert (not found)', async () => {
  const { data: todo, error: ie } = await svc.from('todos').insert({
    title: MARK + '-rpc-other-org', tenant_id: B.org, created_by: B.admin,
  }).select('id').single();
  assert.equal(ie, null, ie?.message);
  createdTodos.push(todo.id);

  const { error } = await clients.aAssist.rpc('complete_todo', { p_id: todo.id });
  assert.ok(error, 'Assistent A konnte Todo aus Org B erledigen!');
  assert.match(error.message, /not found/);

  const { data: check } = await svc.from('todos').select('status').eq('id', todo.id).single();
  assert.equal(check.status, 'open', 'B-Todo wurde durch A-Assistenten verändert!');
});

// ── Symmetrie-Stichprobe: B sieht nichts von A ───────────────────────────────
test('Symmetrie: Admin B sieht nur Tenant-B-Daten in allen drei Tabellen', async () => {
  for (const tbl of ['todo_templates', 'todo_checks', 'todos']) {
    const { data, error } = await clients.bAdmin.from(tbl).select('tenant_id');
    assert.equal(error, null, tbl + ': ' + error?.message);
    assert.ok(data.every((r) => r.tenant_id === B.org), tbl + ': A-Daten bei B sichtbar!');
  }
});
