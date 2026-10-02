import { h, md, gapText, sfx, mapFigure, confetti, rankMeter, guardBack } from './ui.js';
import { api } from './api.js';
import { faceOf } from './avatar.js';

/**
 * Blitzrunde: 60 Sekunden, so viele Aufgaben wie möglich. Keine Wiederholungen,
 * Fehler kosten nur Zeit. Am Ende zählt der persönliche Rekord (und der der Familie).
 */
export function runBlitz(root, { childId, subject, topic, lineColor, onExit, onAgain }) {
  const keys = new AbortController();
  let session = null;
  let stopped = false;
  let cd = 0;
  let pos = 0;
  let score = 0;
  let busy = false;
  let timeUp = false;
  let endAt = 0;
  let timerId = 0;
  let onEnter = null;

  // Hält Countdown und Uhr an – sonst taucht das Ergebnis später über einer anderen Seite auf.
  const cleanup = () => {
    stopped = true;
    keys.abort();
    clearInterval(cd);
    clearInterval(timerId);
  };
  const exit = () => {
    if (timeUp || confirm('Blitzrunde abbrechen?')) {
      cleanup();
      release(onExit);
    }
  };

  const exitBtn = h('button.icon-btn', { type: 'button', title: 'Abbrechen', 'aria-label': 'Abbrechen', onclick: exit }, '✕');
  const bar = h('.blitz-bar', h('span'));
  const secs = h('span.blitz-secs', '60');
  const scoreEl = h('span.blitz-score', '⚡ 0');
  const stage = h('div');
  const wrap = h('section.ride.blitz', { style: { '--line': lineColor } },
    h('.ride-top', exitBtn, h('.blitz-time', bar, secs), scoreEl),
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

  const release = guardBack(exit);
  window.addEventListener('hashchange', () => { cleanup(); release(); }, { signal: keys.signal });

  // ---------------------------------------------------------------- 3 – 2 – 1
  const countdown = h('.countdown', '3');
  stage.replaceChildren(h('.blitz-ready', h('p', topic.title), countdown));
  let n = 3;
  sfx.tick();
  cd = setInterval(async () => {
    n--;
    if (n > 0) {
      countdown.textContent = n;
      sfx.tick();
      return;
    }
    clearInterval(cd);
    countdown.textContent = 'Los!';
    sfx.go();
    try {
      session = await api('/sessions', { method: 'POST', body: { childId, subject, topic: topic.id, mode: 'blitz' } });
    } catch (err) {
      if (stopped) return;
      stage.replaceChildren(h('.empty', h('p', err.message), h('button.btn', { type: 'button', onclick: () => { cleanup(); release(onExit); } }, 'Zurück')));
      return;
    }
    if (stopped) return;
    const total = session.seconds * 1000;
    endAt = Date.now() + total;
    timerId = setInterval(() => {
      const left = Math.max(0, endAt - Date.now());
      bar.firstChild.style.width = `${(left / total) * 100}%`;
      secs.textContent = Math.ceil(left / 1000);
      wrap.classList.toggle('hurry', left < 10000);
      if (left <= 0) finish();
    }, 100);
    show();
  }, 800);

  // ---------------------------------------------------------------- Aufgaben
  function show() {
    if (timeUp || stopped) return;
    const q = session.questions[pos];
    if (!q) return finish();
    busy = false;
    onEnter = null;
    const card = h('article.qcard.blitz-card',
      h('.prompt', h('span', q.prompt)),
      q.text ? h('.qtext', { html: gapText(q.text) }) : null,
      q.textDe ? h('p.qde', `🇩🇪 ${q.textDe}`) : null,
      q.map ? mapFigure(q.map.src, { mark: q.map.mark }) : null,
      h('.answer-area', q.type === 'input' ? inputArea(q) : choiceArea(q)));
    stage.replaceChildren(card);
    card.querySelector('input')?.focus();
  }

  function choiceArea(q) {
    return h('.options', (q.options ?? []).map((opt) =>
      h('button.opt', { type: 'button', 'data-value': opt, html: md(opt), onclick: (e) => submit(q, opt, e.currentTarget) })));
  }

  function inputArea(q) {
    const input = h('input.type-in', {
      type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      inputmode: q.numeric ? 'numeric' : null, enterkeyhint: 'done', placeholder: q.placeholder ?? '', 'aria-label': 'Deine Antwort',
    });
    const check = () => {
      if (!input.value.trim()) return input.focus();
      submit(q, input.value, input);
    };
    onEnter = check;
    return h('.blitz-input', input, h('button.btn.line', { type: 'button', onclick: check }, 'OK'));
  }

  async function submit(q, answer, el) {
    if (busy || timeUp || stopped) return;
    busy = true;
    let res;
    try {
      res = await api(`/sessions/${session.sessionId}/answer`, { method: 'POST', body: { qid: q.id, answer } });
    } catch (err) {
      if (err.status === 409) return finish();
      busy = false;
      return;
    }
    const card = stage.querySelector('.qcard');
    el?.classList.add(res.correct ? 'right' : 'wrong');
    if (res.correct) {
      score++;
      scoreEl.textContent = `⚡ ${score}`;
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('bump');
      sfx.right();
      card?.classList.add('flash-ok');
    } else {
      sfx.wrong();
      card?.classList.add('flash-bad');
      stage.querySelectorAll('.opt').forEach((b) => { if (b.dataset.value === res.solution) b.classList.add('right'); });
      if (q.type === 'input') card?.append(h('p.blitz-solution', { html: `Richtig: ${md(res.solution)}` }));
    }
    setTimeout(() => { pos++; show(); }, res.correct ? 220 : 900);
  }

  // ---------------------------------------------------------------- Ergebnis
  async function finish() {
    if (timeUp || stopped) return;
    timeUp = true;
    cleanup();
    release();
    bar.firstChild.style.width = '0%';
    secs.textContent = '0';
    stage.replaceChildren(h('.blitz-ready', h('.countdown', 'Zeit!')));
    sfx.arrive();
    const here = location.hash;
    let result;
    let records;
    try {
      result = await api(`/sessions/${session.sessionId}/finish`, { method: 'POST' });
      records = await api(`/children/${childId}/blitz/${subject}/${topic.id}`);
    } catch (err) {
      stage.replaceChildren(h('.empty', h('p', err.message), h('button.btn', { type: 'button', onclick: onExit }, 'Zurück')));
      return;
    }
    // Inzwischen woanders hin gewechselt? Dann das Ergebnis nicht über die neue Seite legen.
    if (location.hash !== here) return;
    if (result.empty) {
      stage.replaceChildren(h('.empty', h('p', 'Keine Aufgabe beantwortet – das zählt nicht. Probier es nochmal!'),
        h('.actions', h('button.btn.line', { type: 'button', onclick: onAgain }, '⚡ Nochmal'), h('button.btn.ghost', { type: 'button', onclick: onExit }, 'Zurück'))));
      return;
    }
    const b = result.blitz;
    if (b.newRecord || result.xp.rankUp || result.plan?.justCompleted) {
      sfx.fanfare();
      setTimeout(() => confetti(), 400);
    }
    root.replaceChildren(h('section.arrival', { style: { '--line': lineColor } },
      h('.board',
        h('.eyebrow', `Blitzrunde · ${topic.title}`),
        h('h1', b.newRecord ? 'Neuer Rekord!' : b.prevBest === 0 ? 'Erste Blitzrunde!' : 'Geschafft!'),
        h('.blitz-big', `⚡ ${b.score}`),
        h('p.score', `${b.score} richtig von ${b.answered} beantworteten Aufgaben.${b.prevBest && !b.newRecord ? ` Dein Rekord: ${b.prevBest}.` : ''}`)),
      result.plan?.justCompleted
        ? h('section.panel.plan-done',
            h('.stamp', { 'aria-hidden': 'true' }, h('span', '✔'), h('small', 'Erledigt')),
            h('div', h('h2', '📋 Tagesfahrplan erfüllt!'), h('p', `Stempel Nr. ${result.plan.stamps} für dein Stempelheft.`)))
        : null,
      records.runs.length > 1 ? h('section.panel', { style: { textAlign: 'left' } }, h('h2', '📈 Deine letzten Runden'), runChart(records.runs)) : null,
      familyBoard(records.family, childId),
      h('section.panel', { style: { textAlign: 'left' } }, h('h2', `✨ +${result.xp.gained} XP`), rankMeter(result.xp.rank)),
      result.newBadges.length
        ? h('section.panel', h('h2', '🎉 Neues Abzeichen!'),
            h('.new-badges', result.newBadges.map((x) => h('.badge.pop', h('.medal', x.icon), h('.bname', x.name), h('.bdesc', x.desc)))))
        : null,
      h('.actions',
        h('button.btn.line.big', { type: 'button', onclick: onAgain }, '⚡ Nochmal'),
        h('button.btn.ghost.big', { type: 'button', onclick: onExit }, 'Zurück'))));
    window.scrollTo(0, 0);
  }
}

/** Säulen der letzten Runden, die beste hervorgehoben. */
export function runChart(runs) {
  const max = Math.max(...runs.map((r) => r.score), 1);
  const best = Math.max(...runs.map((r) => r.score));
  return h('.run-chart',
    runs.map((r, i) =>
      h('.run-col', { title: `${r.score} richtig` },
        h('span.run-val', r.score),
        h('span.run-bar', { class: [r.score === best ? 'best' : '', i === runs.length - 1 ? 'last' : ''].join(' '), style: { height: `${Math.max(4, (r.score / max) * 100)}%` } }))));
}

/** Familien-Rekorde: alle Profile, die diese Blitzrunde schon gespielt haben. */
export function familyBoard(family, childId) {
  if (!family.length) return null;
  return h('section.panel', { style: { textAlign: 'left' } },
    h('h2', '👨‍👩‍👧 Familien-Rekorde'),
    h('ol.family', family.map((f, i) =>
      h('li', { class: f.id === Number(childId) ? 'me' : '' },
        h('span.place', i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`),
        h('span.face', faceOf(f)),
        h('span.who', f.name),
        h('span.best', `⚡ ${f.best}`)))),
    family.length < 2 ? h('p.muted.small', 'Tipp: Mama oder Papa können im Elternbereich ein eigenes Profil anlegen und dich herausfordern!') : null);
}
