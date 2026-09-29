import { h, md, gapText, speak, canSpeak, sfx, escapeHtml, mapFigure, confetti, countUp, rankMeter } from './ui.js';
import { api } from './api.js';

const PRAISE = ['Richtig!', 'Super!', 'Klasse!', 'Genau!', 'Stark!', 'Perfekt!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Spielt eine Übung („Fahrt“) ab.
 * Falsch beantwortete Aufgaben kommen am Ende noch einmal – gewertet wird nur der erste Versuch.
 */
export function runRide(root, session, { lineColor, train: trainIcon = '🚆', card = null, onExit, onAgain }) {
  const lang = session.speechLang;
  const total = session.questions.length;
  const queue = session.questions.map((q) => ({ q, retry: false }));
  const status = new Array(total).fill(null);
  let pos = 0;
  let busy = false;
  let onEnter = null;
  let combo = 0;
  const keys = new AbortController();

  const say = (text) => lang && text && speak(text, lang);

  // ---------------------------------------------------------------- Gerüst
  const trackDots = h('.dots', status.map(() => h('span.dot')));
  const railDone = h('.rail-done');
  const train = h('span.train', { 'aria-hidden': 'true' }, trainIcon);
  const count = h('span.ride-count');
  const comboBadge = h('span.combo', { 'aria-live': 'polite' });
  const stage = h('div');
  const wrap = h('section.ride', { style: { '--line': lineColor } },
    h('.ride-top',
      h('button.icon-btn', { type: 'button', title: 'Fahrt abbrechen', 'aria-label': 'Fahrt abbrechen', onclick: exit }, '✕'),
      h('.track', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total }, h('.rail'), railDone, trackDots, train),
      count),
    comboBadge,
    stage);
  root.replaceChildren(wrap);
  window.scrollTo(0, 0);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    } else if (/^[1-4]$/.test(e.key) && !e.target.matches('input')) {
      stage.querySelectorAll('.options .opt')[Number(e.key) - 1]?.click();
    }
  }, { signal: keys.signal });

  function exit() {
    if (!confirm('Fahrt wirklich abbrechen? Sterne gibt es nur, wenn du am Ziel ankommst.')) return;
    cleanup();
    onExit();
  }

  function cleanup() {
    keys.abort();
    document.querySelectorAll('.sheet, .dock').forEach((el) => el.remove());
    window.speechSynthesis?.cancel();
  }

  function updateTrack() {
    const answered = status.filter(Boolean).length;
    const frac = total > 1 ? Math.min(answered, total - 1) / (total - 1) : 1;
    railDone.style.width = `calc((100% - 20px) * ${frac})`;
    train.style.left = `calc(10px + (100% - 20px) * ${frac})`;
    [...trackDots.children].forEach((d, i) => { d.className = `dot ${status[i] ?? ''}`; });
    wrap.querySelector('.track').setAttribute('aria-valuenow', answered);
    count.textContent = queue[pos]?.retry ? 'Extra' : `${Math.min(answered + 1, total)}/${total}`;
  }

  // ---------------------------------------------------------------- Aufgabe anzeigen
  function show() {
    document.querySelectorAll('.sheet, .dock').forEach((el) => el.remove());
    onEnter = null;
    busy = false;
    updateTrack();
    const { q, retry } = queue[pos];

    const listenOnly = q.audio && !q.text;
    const card = h('article.qcard',
      h('.prompt',
        h('span', q.prompt),
        retry ? h('span.retry-tag', 'Nochmal') : null,
        q.audio && !listenOnly && canSpeak() ? h('button.listen-btn.small', { type: 'button', 'aria-label': 'Anhören', onclick: () => say(q.audio) }, '🔊') : null),
      listenOnly
        ? canSpeak()
          ? h('button.listen-btn', { type: 'button', 'aria-label': 'Anhören', onclick: () => say(q.audio) }, '🔊')
          : h('.qtext', q.audio)
        : q.text ? h('.qtext', { html: gapText(q.text) }) : null,
      q.map ? mapFigure(q.map.src, { mark: q.map.mark }) : null,
      q.textDe ? h('p.qde', `🇩🇪 ${q.textDe}`) : null,
      q.hint ? h('span.qhint', { html: `Hilfe: ${md(q.hint)}` }) : null,
      h('.answer-area', answerArea(q)));

    stage.replaceChildren(card);
    if (q.autoplay) setTimeout(() => say(q.audio), 250);
    card.querySelector('input')?.focus();
  }

  function answerArea(q) {
    switch (q.type) {
      case 'choice': return choiceArea(q);
      case 'input': return inputArea(q);
      case 'order': return orderArea(q);
      case 'match': return matchArea(q);
      default: return h('p', 'Unbekannter Aufgabentyp');
    }
  }

  function choiceArea(q) {
    const buttons = q.options.map((opt) =>
      h('button.opt', {
        type: 'button',
        onclick: async (e) => {
          if (busy) return;
          const clicked = e.currentTarget;
          buttons.forEach((b) => (b.disabled = true));
          const res = await submit(q, opt);
          if (!res) return buttons.forEach((b) => (b.disabled = false));
          clicked.classList.add(res.correct ? 'right' : 'wrong');
          buttons.forEach((b) => { if (b.dataset.value === res.solution) b.classList.add('right'); });
        },
        'data-value': opt,
        html: md(opt),
      }));
    return h('.options', buttons);
  }

  function inputArea(q) {
    const input = h('input.type-in', {
      type: 'text',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      inputmode: q.numeric ? 'numeric' : null,
      placeholder: q.placeholder ?? '',
      'aria-label': 'Deine Antwort',
    });
    const check = async () => {
      if (busy) return;
      if (!input.value.trim()) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 350);
        return input.focus();
      }
      input.readOnly = true;
      const res = await submit(q, input.value);
      if (!res) { input.readOnly = false; return; }
      input.classList.add(res.correct ? 'right' : 'wrong');
    };
    onEnter = check;
    dock(h('button.btn.line.big', { type: 'button', onclick: check }, 'Prüfen'));
    return input;
  }

  function orderArea(q) {
    const built = h('.built', { 'aria-label': 'Dein Satz' });
    const bankButtons = q.words.map((w, i) =>
      h('button.word', {
        type: 'button',
        onclick: () => {
          if (busy || bankButtons[i].classList.contains('used')) return;
          bankButtons[i].classList.add('used');
          built.append(h('button.word', {
            type: 'button', 'data-i': i,
            onclick: (e) => {
              if (busy) return;
              bankButtons[i].classList.remove('used');
              e.currentTarget.remove();
              updateBtn();
            },
          }, w));
          updateBtn();
        },
      }, w));
    const checkBtn = h('button.btn.line.big', { type: 'button', disabled: true, onclick: () => check() }, 'Prüfen');
    const updateBtn = () => { checkBtn.disabled = built.children.length !== q.words.length; };
    const check = async () => {
      if (busy || checkBtn.disabled) return;
      const answer = [...built.children].map((b) => q.words[Number(b.dataset.i)]);
      const res = await submit(q, answer);
      if (res) built.classList.add(res.correct ? 'right' : 'wrong');
    };
    onEnter = check;
    dock(checkBtn);
    return h('div', built, h('.bank', bankButtons));
  }

  function matchArea(q) {
    const pairs = new Map(q.pairs);
    let mistakes = 0;
    let sel = null;
    let done = 0;
    const pickItem = (btn, side, value) => {
      if (busy || btn.classList.contains('done')) return;
      if (side === 'en') say(value);
      if (!sel || sel.side === side) {
        sel?.btn.classList.remove('sel');
        sel = { btn, side, value };
        btn.classList.add('sel');
        return;
      }
      const en = side === 'en' ? value : sel.value;
      const de = side === 'de' ? value : sel.value;
      const other = sel.btn;
      sel = null;
      other.classList.remove('sel');
      if (pairs.get(en) === de) {
        [btn, other].forEach((b) => { b.classList.add('done'); b.disabled = true; });
        sfx.right();
        if (++done === pairs.size) submit(q, { mistakes });
      } else {
        mistakes++;
        sfx.wrong();
        [btn, other].forEach((b) => { b.classList.add('shake', 'wrong'); setTimeout(() => b.classList.remove('shake', 'wrong'), 400); });
      }
    };
    const col = (items, side) => h('.col', items.map((v) => {
      const btn = h('button.opt', { type: 'button', onclick: () => pickItem(btn, side, v) }, v);
      return btn;
    }));
    return h('.match', col(shuffle([...pairs.keys()]), 'en'), col(shuffle([...pairs.values()]), 'de'));
  }

  function dock(button) {
    document.body.append(h('.dock', { style: { '--line': lineColor } }, h('.dock-inner', button)));
  }

  // ---------------------------------------------------------------- Antwort prüfen
  async function submit(q, answer) {
    if (busy) return null;
    busy = true;
    let res;
    try {
      res = await api(`/sessions/${session.sessionId}/answer`, { method: 'POST', body: { qid: q.id, answer } });
    } catch (err) {
      busy = false;
      alert(err.message);
      if (err.status === 404) { cleanup(); onExit(); }
      return null;
    }
    if (res.firstTry) status[q.id] = res.correct ? 'ok' : 'miss';
    if (!res.correct && res.firstTry && q.type !== 'match') queue.push({ q, retry: true });
    updateTrack();
    // Mehrere Lücken (z. B. ___ · ___ = 144) bekommen alle dieselbe Lösung.
    if (res.solution) {
      for (const gap of stage.querySelectorAll('.qtext .gap')) {
        gap.textContent = res.correct && q.type === 'input' ? String(answer).trim() : res.solution;
        gap.classList.add('filled');
      }
    }
    updateCombo(res.combo ?? 0);
    if (res.correct && combo >= 3) sfx.combo(combo);
    else if (res.correct) sfx.right();
    else sfx.wrong();
    if (res.speak) setTimeout(() => say(res.speak), res.correct ? 250 : 600);
    feedback(q, res);
    return res;
  }

  // ---------------------------------------------------------------- Serie
  const COMBO_STEPS = { 3: 'Schnellzug!', 5: 'ICE!', 8: 'Hochgeschwindigkeit!', 12: 'Rekordfahrt!' };
  function updateCombo(n) {
    const prev = combo;
    combo = n;
    train.classList.toggle('express', n >= 3 && n < 5);
    train.classList.toggle('ice', n >= 5);
    comboBadge.replaceChildren();
    comboBadge.className = 'combo';
    if (n >= 2) {
      comboBadge.append(h('span.combo-n', `🔥 ${n} in Folge`));
      comboBadge.classList.add('on');
    }
    if (n > prev && COMBO_STEPS[n]) {
      const pop = h('span.combo-pop', COMBO_STEPS[n]);
      comboBadge.append(pop);
      setTimeout(() => pop.remove(), 1600);
    } else if (prev >= 3 && n === 0) {
      comboBadge.append(h('span.combo-lost', `Serie beendet – ${prev} in Folge!`));
    }
  }

  function feedback(q, res) {
    document.querySelectorAll('.dock').forEach((el) => el.remove());
    let title;
    let lines = [];
    if (q.type === 'match') {
      title = res.mistakes === 0 ? pick(PRAISE) : res.correct ? 'Fast fehlerfrei!' : 'Geschafft!';
      if (res.mistakes) lines.push(h('p.explain', `${res.mistakes} ${res.mistakes === 1 ? 'Fehlgriff' : 'Fehlgriffe'} – ${res.correct ? 'zählt trotzdem als richtig.' : 'beim nächsten Mal klappt es besser.'}`));
    } else if (res.correct) {
      title = pick(PRAISE);
      if (res.reveal) lines.push(h('p.solution', { html: `Das Wort war: ${escapeHtml(res.reveal)}` }));
      if (res.note) lines.push(h('p.explain', res.note));
    } else {
      title = res.almost ? 'Fast! Nur ein Buchstabe falsch.' : 'Nicht ganz.';
      lines.push(h('p.solution', { html: `Richtig ist: ${md(res.solution)}` }));
      if (res.reveal) lines.push(h('p.explain', { html: `Das Wort war: <strong>${escapeHtml(res.reveal)}</strong>` }));
      if (res.explain) lines.push(h('div.explain', { html: `<p>${md(res.explain)}</p>` }));
      if (res.firstTry) lines.push(h('p.explain', 'Diese Aufgabe kommt am Ende nochmal.'));
    }
    const next = () => {
      onEnter = null;
      pos++;
      if (pos < queue.length) show();
      else finish();
    };
    const btn = h('button.btn.big', { type: 'button', class: res.correct ? 'go' : '', onclick: next }, 'Weiter');
    const sheet = h('.sheet', { class: res.correct ? 'ok' : 'bad', role: 'alert' },
      h('.sheet-inner',
        h('h3', title),
        ...lines,
        res.speak && canSpeak() ? h('p', h('button.say', { type: 'button', onclick: () => say(res.speak) }, '🔊 Nochmal anhören')) : null,
        btn));
    document.body.append(sheet);
    // Kurz warten, damit ein Doppel-Enter nicht gleich weiterspringt.
    setTimeout(() => { onEnter = next; btn.focus({ preventScroll: true }); }, 250);
  }

  // ---------------------------------------------------------------- Ankunft
  async function finish() {
    cleanup();
    stage.replaceChildren(h('.loading', 'Einfahrt in den Bahnhof …'));
    let result;
    try {
      result = await api(`/sessions/${session.sessionId}/finish`, { method: 'POST' });
    } catch (err) {
      stage.replaceChildren(h('.empty', h('p', err.message), h('button.btn', { type: 'button', onclick: onExit }, 'Zurück')));
      return;
    }
    const exam = result.exam;
    const headline = exam
      ? exam.passed ? 'Endbahnhof erreicht!' : 'Knapp vor dem Ziel!'
      : { 3: 'Perfekte Fahrt!', 2: 'Gute Fahrt!', 1: 'Angekommen!' }[result.rating];
    const sub = exam
      ? exam.passed ? 'Du kennst die ganze Linie!' : `Ab 80 % ist die Prüfung bestanden, du hattest ${exam.percent} %. Übe die Stationen und versuch es nochmal.`
      : { 3: 'Du bist spitze!', 2: 'Nur noch ein kleines Stück bis zu drei Sternen.', 1: 'Übung macht den Meister – fahr die Strecke ruhig nochmal.' }[result.rating];
    const celebrate = result.rating === 3 || result.xp.rankUp || result.plan?.justCompleted || exam?.first;
    if (celebrate) {
      sfx.fanfare();
      setTimeout(() => confetti(), 700);
    } else sfx.arrive();

    const balanceEl = h('span');
    countUp(balanceEl, result.balance - result.awarded, result.balance, { delay: 1400 });

    const panels = [];
    if (result.plan?.justCompleted) {
      setTimeout(() => sfx.stamp(), 1200);
      panels.push(h('section.panel.plan-done',
        h('.stamp', { 'aria-hidden': 'true' }, h('span', '✔'), h('small', 'Erledigt')),
        h('div', h('h2', '📋 Tagesfahrplan erfüllt!'), h('p', `Ein neuer Stempel für dein Stempelheft – das ist schon Stempel Nr. ${result.plan.stamps}.`))));
    }
    if (result.newCard && card) {
      panels.push(h('section.panel',
        h('h2', '🃏 Neue Sammelkarte!'),
        h('.card-reveal', collectCard({ ...card, owned: true, fresh: true }))));
    }
    if (exam?.first && card) {
      panels.push(h('section.panel',
        h('h2', '🏆 Goldkarte freigeschaltet!'),
        h('.card-reveal', collectCard({ ...card, owned: true, fresh: true, gold: true }))));
    }
    if (result.xp.rankUp) {
      const r = result.xp.rankUp;
      panels.push(h('section.panel.rank-up',
        h('.big-train', { 'aria-hidden': 'true' }, r.train),
        h('div', h('h2', `Neuer Rang: ${r.name}!`), h('p', `Du hast einen neuen Zug freigeschaltet: ${r.train}. Du kannst ihn in deiner Sammlung auswählen.`))));
    }

    const comboLine = result.bestCombo >= 3
      ? h('p.score', `🔥 Längste Serie: ${result.bestCombo} in Folge${result.comboRecord ? ' – neuer Rekord!' : ''}`)
      : null;

    root.replaceChildren(h('section.arrival', { style: { '--line': lineColor } },
      h('.board',
        h('.eyebrow', `Endstation · ${session.title}`),
        h('h1', headline),
        h('.big-stars', { role: 'img', 'aria-label': `${result.rating} von 3 Sternen` },
          [1, 2, 3].map((i) => h('span', { class: i <= result.rating ? 'on' : 'off' }, '★'))),
        h('p.score', `${result.correct} von ${result.total} beim ersten Versuch richtig. ${sub}`),
        comboLine),
      ...panels,
      h('section.panel', { style: { textAlign: 'left' } },
        h('h2', `✨ +${result.xp.gained} XP`),
        rankMeter(result.xp.rank)),
      result.adult
        ? h('section.panel', { style: { textAlign: 'left' } }, h('p.muted', 'Erwachsenen-Profil: Hier gibt es keine Sterne – aber Rekorde und XP zählen!'))
        : h('section.panel', { style: { textAlign: 'left' } },
            h('h2', 'Deine Sterne'),
            h('ul.rewards', result.rewards.map((r) =>
              h('li',
                h('span', r.note),
                h('span.amt', r.given < r.amount
                  ? [r.given ? `+${r.given} ★ ` : '', h('span.capped', `+${r.amount - r.given}`)]
                  : `+${r.given} ★`)))),
            result.capped > 0 ? h('p.muted', 'Dein Sterne-Limit für heute ist erreicht. Morgen gibt es wieder neue – üben lohnt sich trotzdem!') : null,
            h('p', h('strong', 'Du hast jetzt ', balanceEl, ' Sterne.'))),
      result.newBadges.length
        ? h('section.panel',
            h('h2', result.newBadges.length === 1 ? '🎉 Neues Abzeichen!' : '🎉 Neue Abzeichen!'),
            h('.new-badges', result.newBadges.map((b, i) =>
              h('.badge.pop', { style: { animationDelay: `${0.8 + i * 0.25}s` } },
                h('.medal', { 'aria-hidden': 'true' }, b.icon), h('.bname', b.name), h('.bdesc', b.desc)))))
        : null,
      h('.actions',
        h('button.btn.line.big', { type: 'button', onclick: onAgain }, '🔁 Nochmal fahren'),
        h('button.btn.ghost.big', { type: 'button', onclick: onExit }, '🗺️ Zum Netzplan'))));
    window.scrollTo(0, 0);
  }

  show();
}

/** Eine Sammelkarte (für die Ankunft und das Sammelalbum). */
export function collectCard({ icon, title, text, color, number, owned, fresh = false, gold = false, hint = null }) {
  const cls = [owned ? '' : 'locked', fresh ? 'fresh' : '', gold ? 'gold' : ''].filter(Boolean).join(' ');
  return h('article.ccard', { class: cls, style: { '--line': color } },
    h('.ccard-inner',
      h('.ccard-top', h('span.ccard-no', gold ? 'Goldkarte' : number ? `Nr. ${number}` : ''), gold ? h('span', '🏆') : null),
      h('.ccard-icon', { 'aria-hidden': 'true' }, owned ? icon : '?'),
      h('.ccard-title', title),
      owned
        ? h('.ccard-text', { html: md(text ?? '') })
        : h('.ccard-text.muted', hint ?? 'Hol 3 Sterne bei dieser Station, dann gehört die Karte dir.')));
}
