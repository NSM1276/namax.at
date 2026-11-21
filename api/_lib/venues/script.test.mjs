import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, GLOBAL_CHIPS, isRemovalText } from './script.mjs';
import { PHRASES, LANGS, say } from './phrases.mjs';

const ctx = (extra = {}) => ({
  name: 'Friseur Meidling', url: 'https://friseur-meidling.namax.at/', confirmed: false, hits: 7, shownPhotos: 0,
  hasPending: false, budgetLeft: true, check: () => ({ ok: true }), ...extra,
});
const run = (inputs, c = ctx()) => {
  let state = {}, out;
  for (const input of inputs) { out = step(state, input, c); state = out.state; }
  return out;
};
const ids = (out) => out.chips.map((c) => c.id);
const NO_CONTACT = /wa\.me|tel:|\+43|0660|0676|whatsapp/i;

test('every phrase key exists in every language', () => {
  const keys = Object.keys(PHRASES.de);
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(PHRASES[l]).sort(), [...keys].sort(), l);
    assert.equal(PHRASES[l].days.length, 7, l);
  }
});

test('no phrase contains a phone number or a WhatsApp link', () => {
  for (const l of LANGS) for (const [k, v] of Object.entries(PHRASES[l])) assert.doesNotMatch(String(v), NO_CONTACT, `${l}.${k}`);
});

test('the chat starts with the language choice, then the question about the data', () => {
  const first = run([{ start: true }]);
  assert.deepEqual(ids(first).filter((x) => x.startsWith('lang_')), LANGS.map((l) => 'lang_' + l));
  const second = run([{ start: true }, { chip: 'lang_tr' }]);
  assert.equal(second.state.lang, 'tr');
  assert.equal(second.chips[0].label, say('tr', 'c_yes_all'), 'chips in the language just chosen');
  assert.ok(second.say.includes(say('tr', 'askCorrect')));
  assert.deepEqual(ids(second).slice(0, 2), ['yes_all', 'change']);
});

test('the whole happy path makes no model call', () => {
  const inputs = [{ start: true }, { chip: 'lang_de' }, { chip: 'yes_all' }, { chip: 'photos_yes' }, { photo: { id: 1 } }, { chip: 'photos_done' }];
  let state = {};
  const effects = [];
  for (const input of inputs) { const o = step(state, input, ctx()); state = o.state; if (o.effect) effects.push(o.effect.type); }
  assert.deepEqual(effects, ['confirm', 'showPhoto']);
  assert.ok(!effects.includes('needModel'));
});

test('hours entered in the form are checked and applied without the model', () => {
  const hours = [null, [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1020]];
  const o = run([{ start: true }, { chip: 'lang_de' }, { chip: 'change' }, { chip: 'hours' }]);
  assert.equal(o.form, 'hours');
  const applied = step(o.state, { form: 'hours', values: hours }, ctx());
  assert.deepEqual(applied.effect, { type: 'apply', changes: { hours } });
  assert.ok(applied.say.includes(say('de', 'saved')));
  const refused = step(o.state, { form: 'hours', values: hours }, ctx({ check: () => ({ ok: false, problems: ['x'] }) }));
  assert.equal(refused.effect, null);
  assert.equal(refused.form, 'hours');
});

test('a phone entered in the form is normalised and applied', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }, { chip: 'change' }, { chip: 'phone' }]);
  assert.equal(o.form, 'phone');
  assert.deepEqual(step(o.state, { form: 'phone', values: { phone: '0660 412 00 63' } }, ctx()).effect, { type: 'apply', changes: { phone: '+436604120063' } });
  assert.equal(step(o.state, { form: 'phone', values: { phone: 'call me' } }, ctx()).effect, null);
});

test('free text asks the model while the budget lasts, then goes to Nasim', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }]);
  assert.deepEqual(step(o.state, { text: 'Samstag bis 17 Uhr' }, ctx()).effect, { type: 'needModel', kind: 'text', text: 'Samstag bis 17 Uhr' });
  const spent = step(o.state, { text: 'Samstag bis 17 Uhr' }, ctx({ budgetLeft: false }));
  assert.deepEqual(spent.effect, { type: 'handoff', text: 'Samstag bis 17 Uhr' });
  assert.ok(spent.say.includes(say('de', 'forwarded')));
});

test('a price board photo asks the model; its list is proposed, not applied', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }, { chip: 'change' }, { chip: 'prices' }, { chip: 'price_photo' }]);
  const need = step(o.state, { photo: { id: 9 } }, ctx());
  assert.deepEqual(need.effect, { type: 'needModel', kind: 'priceboard', photoId: 9 });
  const list = { asOf: '2026-11', groups: [{ items: [{ name: 'Haarschnitt', price: 15 }, { name: 'Bart', price: 8 }] }] };
  const read = step(need.state, { model: { type: 'priceList', list } }, ctx());
  assert.deepEqual(read.effect, { type: 'setPending', changes: { list } });
  assert.ok(read.say[0].includes('2'));
  assert.ok(read.say.some((s) => s.includes('Haarschnitt') && s.includes('15')));
  assert.deepEqual(ids(read).slice(0, 2), ['correct', 'not_quite']);
});

test('a proposal is applied only by a yes in a later input', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }]);
  const prop = step(o.state, { model: { type: 'proposal', changes: { phone: '+4312345678' }, summary: 'Telefon +43 1 2345678' } }, ctx());
  assert.deepEqual(prop.effect, { type: 'setPending', changes: { phone: '+4312345678' } });
  const yes = step(prop.state, { chip: 'apply_yes' }, ctx({ hasPending: true }));
  assert.deepEqual(yes.effect, { type: 'applyPending' });
  const typedYes = step(prop.state, { text: 'Ja passt' }, ctx({ hasPending: true }));
  assert.deepEqual(typedYes.effect, { type: 'applyPending' });
  const no = step(prop.state, { chip: 'apply_no' }, ctx({ hasPending: true }));
  assert.deepEqual(no.effect, { type: 'clearPending' });
  const noPending = step(prop.state, { chip: 'apply_yes' }, ctx({ hasPending: false }));
  assert.equal(noPending.effect, null);
});

test('removal: by chip or by angry text, at once, no contact details, two follow-ups then the fixed phrase', () => {
  for (const input of [{ chip: 'delete' }, { text: 'Löschen Sie das sofort, ich mache Anzeige!' }, { text: 'sayfamı silin' }, { text: 'احذف الصفحة' }]) {
    const o = step({ lang: 'de', step: 'ask' }, input, ctx());
    assert.deepEqual(o.effect, { type: 'removal' }, JSON.stringify(input));
  }
  let o = step({ lang: 'de', step: 'ask' }, { chip: 'delete' }, ctx());
  assert.ok(o.say.includes(say('de', 'removed')));
  const replies = [o];
  for (const input of [{ chip: 'q_who' }, { chip: 'q_sees' }, { chip: 'q_data' }, { text: 'Ich will Ihre Nummer!' }]) {
    o = step(o.state, input, ctx({ status: 'removed' }));
    replies.push(o);
    assert.notEqual(o.effect?.type, 'needModel');
  }
  assert.ok(replies[1].say.includes(say('de', 'a_who')));
  assert.ok(replies[2].say[0].startsWith(say('de', 'a_sees', { n: 7 }).slice(0, 20)));
  assert.deepEqual(replies[3].say, [say('de', 'removedFinal')]);
  assert.deepEqual(replies[4].say, [say('de', 'removedFinal')]);
  for (const r of replies) {
    assert.doesNotMatch(JSON.stringify(r.say) + JSON.stringify(r.chips), NO_CONTACT);
  }
});

test('questions are answered with saved phrases and never offer a contact', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }, { chip: 'questions' }]);
  assert.ok(ids(o).includes('q_data'));
  const a = step(o.state, { chip: 'q_data' }, ctx());
  assert.ok(a.say.includes(say('de', 'a_data')));
  assert.equal(a.state.lane, 'questions');
  const human = step(o.state, { model: { type: 'answer', key: 'human' } }, ctx());
  assert.ok(human.say.includes(say('de', 'humanQ')));
  for (const r of [o, a, human]) assert.doesNotMatch(JSON.stringify(r), NO_CONTACT);
});

test('the WhatsApp offer appears only for a confirmed venue', () => {
  const unconfirmed = run([{ start: true }, { chip: 'lang_de' }, { chip: 'change' }, { chip: 'other' }]);
  const close = (c) => step({ ...unconfirmed.state, step: 'photos' }, { chip: 'photos_no' }, c);
  assert.ok(!close(ctx()).chips.some((c) => c.href));
  const talk = close(ctx({ confirmed: true })).chips.find((c) => c.id === 'talk');
  assert.match(talk.href, /^https:\/\/wa\.me\//);
});

test('every chip a step offers leads to a defined answer', () => {
  const seen = new Set();
  const queue = [{ state: {}, input: { start: true } }];
  while (queue.length) {
    const { state, input } = queue.shift();
    const out = step(state, input, ctx({ hasPending: true }));
    assert.ok(Array.isArray(out.say) && out.say.length, JSON.stringify(input));
    assert.ok(!out.say.some((s) => /missing|undefined/.test(s)), JSON.stringify(out.say));
    for (const c of out.chips) {
      if (c.href) continue;
      const key = (out.state.step || '') + '|' + c.id;
      if (seen.has(key) || seen.size > 400) continue;
      seen.add(key);
      queue.push({ state: out.state, input: { chip: c.id } });
    }
  }
  assert.ok(seen.size > 15);
});

test('an unknown chip is not understood and nothing happens', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }]);
  const x = step(o.state, { chip: 'set_status_public' }, ctx());
  assert.equal(x.effect, null);
  assert.ok(x.say.includes(say('de', 'notUnderstood')));
});

test('switching language mid-flow keeps the step', () => {
  const o = run([{ start: true }, { chip: 'lang_de' }, { chip: 'change' }]);
  const tr = step(o.state, { chip: 'lang_tr' }, ctx());
  assert.equal(tr.state.lang, 'tr');
  assert.equal(tr.state.step, 'change');
  assert.ok(tr.say.includes(say('tr', 'whatChange')));
  assert.ok(GLOBAL_CHIPS.includes('lang_tr'));
});

test('isRemovalText', () => {
  for (const t of ['bitte löschen', 'Ich mache Anzeige', 'delete this', 'sil bunu', 'kaldırın', 'احذف', 'حذفش کن', 'obrišite stranicu']) assert.ok(isRemovalText(t), t);
  for (const t of ['Samstag bis 17 Uhr', 'Haarschnitt 15 Euro', 'merhaba']) assert.ok(!isRemovalText(t), t);
});
