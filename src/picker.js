// "Choose your traveller" screen: body, look, name and outfit colour. Everything is a real radio input or text field,
// so it works with a keyboard and a screen reader; the portraits are decoration and every choice also has a text label.
import { BODIES, LOOKS, OUTFITS, NAME_MAX, avatarSvg, cleanName, lookById, outfitColor, sanitize } from './characters.js';

export function createPicker(doc, { onSave }) {
  const $ = (id) => doc.getElementById(id);
  let state = { body: 'f', look: LOOKS[0].id, name: LOOKS[0].name, outfit: LOOKS[0].outfit, nameEdited: false };

  function radio(group, value, labelHtml, checked, cls) {
    const id = `${group}-${value}`;
    const wrap = doc.createElement('div'); wrap.className = cls;
    wrap.innerHTML = `<input type="radio" name="${group}" id="${id}" value="${value}"${checked ? ' checked' : ''}><label for="${id}">${labelHtml}</label>`;
    return wrap;
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function draw() {
    $('body-list').replaceChildren(...BODIES.map((b) => radio('body', b.id, esc(b.label), state.body === b.id, 'opt')));
    $('look-list').replaceChildren(...LOOKS.filter((l) => l.body === state.body).map((l) =>
      radio('look', l.id, `<span class="avatar">${avatarSvg({ ...l, outfitColor: outfitColor(l.id === state.look ? state.outfit : l.outfit) })}</span><span class="look-name">${esc(l.name)}</span><span class="look-blurb">${esc(l.blurb)}</span>`, l.id === state.look, 'look')));
    $('outfit-list').replaceChildren(...OUTFITS.map((o) =>
      radio('outfit', o.id, `<span class="swatch" style="background:${o.color}" aria-hidden="true"></span><span>${esc(o.label)}</span>`, state.outfit === o.id, 'opt swatch-opt')));
    $('char-name').value = state.name;
  }

  function pickLook(id) {
    const l = lookById(id); if (!l) return;
    state.look = id; state.outfit = l.outfit;
    if (!state.nameEdited) state.name = l.name;
    draw();
    $(`look-${id}`)?.focus();
  }

  doc.addEventListener('change', (e) => {
    const t = e.target; if (!t.closest?.('#screen-character')) return;
    if (t.name === 'body') { state.body = t.value; const first = LOOKS.find((l) => l.body === state.body); state.look = first.id; state.outfit = first.outfit; if (!state.nameEdited) state.name = first.name; draw(); $(`body-${state.body}`).focus(); }
    else if (t.name === 'look') pickLook(t.value);
    else if (t.name === 'outfit') { state.outfit = t.value; const keep = t.value; draw(); $(`outfit-${keep}`).focus(); }
  });
  doc.addEventListener('input', (e) => { if (e.target.id === 'char-name') { state.name = e.target.value; state.nameEdited = true; } });

  return {
    open(current) {
      const s = sanitize(current);
      state = { body: lookById(s.look).body, look: s.look, name: s.name, outfit: s.outfit, nameEdited: s.name !== lookById(s.look).name };
      $('char-name').maxLength = NAME_MAX;
      draw();
    },
    value() { const l = lookById(state.look); return sanitize({ look: state.look, name: cleanName(state.name, l.name), outfit: state.outfit }); },
    save() { onSave(this.value()); },
  };
}
