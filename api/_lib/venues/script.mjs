// The owner chat as a script: saved phrases, chips and small forms. No model call happens here;
// when a person cannot be served otherwise the step returns effect { type: 'needModel' } and the
// caller feeds the model's result back in as input { model }.
//
// step(state, input, ctx) → { state, say: string[], chips: [{ id, label, href? }], form, effect }
//   input:  { start } | { chip } | { form, values } | { text } | { photo: { id } } | { model }
//   ctx:    { name, url, confirmed, hits, shownPhotos, hasPending, budgetLeft, status, check(changes) → { ok } }
//   form:   null | 'hours' | 'phone' | 'photo'
//   effect: null | confirm | apply{changes} | setPending{changes} | applyPending | clearPending | showPhoto{photoId}
//           | needModel{kind,text|photoId} | handoff{text} | removal
import { LANGS, LANG_NAMES, CHOOSE_LANG, say as phrase } from './phrases.mjs';
import { normalizePhone } from './phone.mjs';

export const TALK_URL = 'https://wa.me/4367764292055';
const Q_CHIPS = ['q_who', 'q_data', 'q_cost', 'q_sees', 'q_work'];
export const GLOBAL_CHIPS = [...LANGS.map((l) => 'lang_' + l), 'questions', ...Q_CHIPS, 'delete'];
const STEP_CHIPS = {
  lang: [],
  ask: ['yes_all', 'change', 'questions'],
  change: ['hours', 'prices', 'phone', 'other', 'questions'],
  hours: ['more'], phone: ['more'],
  prices: ['price_photo', 'price_write', 'more'],
  priceboard: ['more'], text: ['more'],
  pending: ['apply_yes', 'apply_no'],
  pricePending: ['correct', 'not_quite'],
  else: ['more', 'done'],
  photos: ['photos_yes', 'photos_no'],
  photo: ['photos_done'],
  closing: ['more', 'questions'],
};
const CHIP_LABEL = { more: 'c_more', done: 'c_done', apply_yes: 'c_apply_yes', apply_no: 'c_apply_no', correct: 'c_correct',
  not_quite: 'c_not_quite', price_photo: 'c_price_photo', price_write: 'c_price_write', hours: 'c_hours', prices: 'c_prices',
  phone: 'c_phone', other: 'c_other', yes_all: 'c_yes_all', change: 'c_change', photos_yes: 'c_photos_yes', photos_no: 'c_photos_no',
  photos_done: 'c_photos_done', questions: 'c_questions', q_who: 'c_q_who', q_data: 'c_q_data', q_cost: 'c_q_cost',
  q_sees: 'c_q_sees', q_work: 'c_q_work', talk: 'c_talk' };
const ANSWERS = { who: 'a_who', data: 'a_data', cost: 'a_cost', sees: 'a_sees', work: 'a_work', human: 'humanQ' };

const REMOVAL = /lösch|losch|entfern|anzeige|anwalt|polizei|klage|verboten|nicht erlaubt|delete|remove|take (it )?down|lawyer|police|\bsil\b|silin|silmek|kaldır|avukat|şikayet|polis|احذف|حذف|امسح|إزالة|ازالة|محامي|شرطة|پاک|وکیل|پلیس|obriš|izbriš|ukloni|advokat|policij|tužb/i;
const YES = /^(ja|jaa|jo|yes|yep|ok|okay|passt|stimmt|genau|richtig|evet|tamam|doğru|نعم|اي|أيوه|صحيح|بله|آره|درسته|da|tačno|tako je)\b/i;
const NO = /^(nein|nee|no|nope|falsch|hayır|yok|yanlış|لا|نه|خیر|ne|nije)\b/i;

export const isRemovalText = (t) => REMOVAL.test(String(t || ''));

export function step(state0, input, ctx) {
  const state = { lane: 'in', ...structuredClone(state0 || {}) };
  const lang = LANGS.includes(state.lang) ? state.lang : 'de';
  const t = (key, vars) => phrase(lang, key, vars);
  const chip = (id) => (id === 'talk' ? { id, label: t('c_talk'), href: TALK_URL }
    : id.startsWith('lang_') ? { id, label: LANG_NAMES[id.slice(5)] } : { id, label: t(CHIP_LABEL[id]) });
  const out = (say, chipIds = [], extra = {}) => ({ state, say, chips: chipIds.map(chip), form: null, effect: null, ...extra });
  const at = (stepName, say, extra = {}) => {
    state.step = stepName;
    const ids = [...(STEP_CHIPS[stepName] || [])];
    if (stepName === 'closing' && ctx.confirmed && state.lane === 'in') ids.unshift('talk');
    return out(say, ids, extra);
  };
  const resume = (before = []) => {
    const s = state.step || 'ask';
    const again = { ask: [t('askCorrect')], change: [t('whatChange')], prices: [t('pricesHow')], else: [t('anythingElse')],
      photos: [t('askPhotos')], closing: [t('closing', { url: ctx.url })], hours: [t('hoursForm')], phone: [t('phoneForm')],
      priceboard: [t('pricePhotoAsk')], text: [t('writeAsk')], photo: [t('photoAsk')],
      pending: [t('anythingElse')], pricePending: [t('anythingElse')] }[s] || [t('askCorrect')];
    const form = { hours: 'hours', phone: 'phone', priceboard: 'photo', photo: 'photo' }[s] || null;
    if ((s === 'pending' || s === 'pricePending') && !ctx.hasPending) return at('else', [...before, t('anythingElse')]);
    return at(s, [...before, ...again], { form });
  };
  const closing = () => {
    const say = [t('closing', { url: ctx.url })];
    if (ctx.confirmed) say.push(t('views', { n: ctx.hits }));
    return at('closing', say);
  };
  const removal = () => {
    state.lane = 'out';
    state.step = 'removed';
    state.afterRemoval = 0;
    return out([t('removed')], ['q_who', 'q_data', 'q_sees'], { effect: { type: 'removal' } });
  };

  // ---- a removed venue: two saved answers at most, then always the same sentence; never a model call
  if (ctx.status === 'removed' || state.step === 'removed') {
    state.step = 'removed';
    state.afterRemoval = (state.afterRemoval || 0) + 1;
    const q = input.chip && Q_CHIPS.includes(input.chip) ? ANSWERS[input.chip.slice(2)] : null;
    if (q && state.afterRemoval <= 2) return out([t(q, { n: ctx.hits })], state.afterRemoval < 2 ? ['q_who', 'q_data', 'q_sees'] : []);
    return out([t('removedFinal')]);
  }

  if (input.start) {
    if (!state.lang) { state.step = 'lang'; return out([CHOOSE_LANG], LANGS.map((l) => 'lang_' + l)); }
    return resume();
  }

  if (input.chip) {
    const id = String(input.chip);
    const allowed = GLOBAL_CHIPS.includes(id) || (STEP_CHIPS[state.step] || []).includes(id);
    if (!allowed) return resume([t('notUnderstood')]);
    if (id.startsWith('lang_')) {
      state.lang = id.slice(5);
      const first = !state.step || state.step === 'lang';
      if (first) return at('ask', [phrase(state.lang, 'intro', { name: ctx.name }), phrase(state.lang, 'askCorrect')]);
      return step(state, { start: true }, ctx);
    }
    if (id === 'delete') return removal();
    if (id === 'questions') return out([t('questionsWhich')], [...Q_CHIPS, ...(STEP_CHIPS[state.step] || []).filter((c) => c !== 'questions')]);
    if (Q_CHIPS.includes(id)) {
      if (state.lane !== 'in' || !ctx.confirmed) state.lane = ctx.confirmed ? state.lane : 'questions';
      return out([t(ANSWERS[id.slice(2)], { n: ctx.hits })], [...Q_CHIPS.filter((c) => c !== id), ...(STEP_CHIPS[state.step] || []).filter((c) => c !== 'questions')]);
    }
    switch (id) {
      case 'yes_all': state.lane = 'in'; return at('photos', [t('confirmedThanks'), t('askPhotos')], { effect: { type: 'confirm' } });
      case 'change': case 'more': return at('change', [t('whatChange')]);
      case 'hours': return at('hours', [t('hoursForm')], { form: 'hours' });
      case 'phone': return at('phone', [t('phoneForm')], { form: 'phone' });
      case 'prices': return at('prices', [t('pricesHow')]);
      case 'price_photo': return at('priceboard', [t('pricePhotoAsk')], { form: 'photo' });
      case 'price_write': case 'other': return at('text', [t('writeAsk')]);
      case 'apply_yes': case 'correct':
        if (!ctx.hasPending) return resume([t('notUnderstood')]);
        state.lane = 'in';
        return at('else', [t('saved'), t('anythingElse')], { effect: { type: 'applyPending' } });
      case 'apply_no': return at('else', [t('notApplied'), t('anythingElse')], { effect: { type: 'clearPending' } });
      case 'not_quite': return at('text', [t('notApplied'), t('writeAsk')], { effect: { type: 'clearPending' } });
      case 'done': return at('photos', [t('askPhotos')]);
      case 'photos_yes':
        if (ctx.shownPhotos >= 4) return closing();
        return at('photo', [t('photoAsk')], { form: 'photo' });
      case 'photos_no': case 'photos_done': return closing();
    }
    return resume([t('notUnderstood')]);
  }

  if (input.form === 'hours') {
    const hours = Array.isArray(input.values) && input.values.length === 7 ? input.values : null;
    if (hours && ctx.check({ hours }).ok) { state.lane = 'in'; return at('else', [t('saved'), t('anythingElse')], { effect: { type: 'apply', changes: { hours } } }); }
    return at('hours', [t('invalid'), t('hoursForm')], { form: 'hours' });
  }
  if (input.form === 'phone') {
    const phone = normalizePhone(input.values?.phone);
    if (phone && ctx.check({ phone }).ok) { state.lane = 'in'; return at('else', [t('saved'), t('anythingElse')], { effect: { type: 'apply', changes: { phone } } }); }
    return at('phone', [t('invalid'), t('phoneForm')], { form: 'phone' });
  }

  if (input.photo) {
    const photoId = input.photo.id;
    if (state.step === 'priceboard') return out([], [], { effect: { type: 'needModel', kind: 'priceboard', photoId } });
    if (ctx.shownPhotos >= 4) return closing();
    const n = ctx.shownPhotos + 1;
    if (n >= 4) {
      const c = closing();
      return { ...c, say: [t('photoAdded', { n }), ...c.say], effect: { type: 'showPhoto', photoId } };
    }
    return at('photo', [t('photoAdded', { n })], { form: 'photo', effect: { type: 'showPhoto', photoId } });
  }

  if (typeof input.text === 'string') {
    const text = input.text.trim().slice(0, 2000);
    if (!text) return resume([t('notUnderstood')]);
    if (isRemovalText(text)) return removal();
    if (ctx.hasPending && (state.step === 'pending' || state.step === 'pricePending')) {
      if (YES.test(text)) { state.lane = 'in'; return at('else', [t('saved'), t('anythingElse')], { effect: { type: 'applyPending' } }); }
      if (NO.test(text)) return at('else', [t('notApplied'), t('anythingElse')], { effect: { type: 'clearPending' } });
    }
    if (!ctx.budgetLeft) return { ...resume([t('forwarded')]), effect: { type: 'handoff', text } };
    return out([], [], { effect: { type: 'needModel', kind: 'text', text } });
  }

  if (input.model) {
    const m = input.model;
    if (m.type === 'proposal' && m.changes && ctx.check(m.changes).ok) {
      return at('pending', [t('proposal', { summary: String(m.summary || '').slice(0, 300) })], { effect: { type: 'setPending', changes: m.changes } });
    }
    if (m.type === 'priceList' && m.list && ctx.check({ list: m.list }).ok) {
      const items = m.list.groups.flatMap((g) => g.items);
      const lines = items.map((it) => `${typeof it.name === 'string' ? it.name : it.name.de} — ${it.price == null ? '' : String(it.price).replace('.', ',') + ' €'}`);
      return at('pricePending', [t('priceRead', { n: items.length }), lines.join('\n')], { effect: { type: 'setPending', changes: { list: m.list } } });
    }
    if (m.type === 'answer' && ANSWERS[m.key]) {
      if (!ctx.confirmed) state.lane = 'questions';
      return resume([t(ANSWERS[m.key], { n: ctx.hits })]);
    }
    if (m.type === 'handoff') return { ...resume([t('forwarded')]), effect: { type: 'handoff', text: String(m.text || '').slice(0, 2000) } };
    if (m.type === 'removal') return removal();
    if (m.type === 'proposal' || m.type === 'priceList') return at('change', [t('invalid'), t('whatChange')]);
    if (m.type === 'error') return resume([t('error')]);
    return resume([t('notUnderstood')]);
  }

  return resume([t('notUnderstood')]);
}
