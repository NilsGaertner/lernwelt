import { h, md, gapText, speak, canSpeak, sfx, escapeHtml, mapFigure, confetti, countUp, rankMeter, toast, guardBack, columnMath, columnSum, columnSteps, mulMath, mulGrid } from './ui.js';
import { api } from './api.js';
import { lootbox } from './lootbox.js';
import { avatarSvg, sleepSvg } from './avatar-data.js';

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
 * onExit: Fahrt abgebrochen · onMap: zum Netzplan · onAgain: nochmal fahren · onNext(next): zur nächsten Station
 */
export function runRide(root, session, { childId, subject = null, lineColor, train: trainIcon = '🚆', card = null, onExit, onMap = onExit, onAgain, onNext }) {
  const lang = session.speechLang;
  const total = session.questions.length;
  const queue = session.questions.map((q) => ({ q, retry: false }));
  const status = new Array(total).fill(null);
  let pos = 0;
  let busy = false;
  let onEnter = null;
  let onKey = null;
  let combo = 0;
  let ended = false;
  const keys = new AbortController();

  const say = (text) => lang && text && speak(text, lang);

  // ---------------------------------------------------------------- Gerüst
  const trackDots = h('.dots', status.map(() => h('span.dot')));
  const railDone = h('.rail-done');
  const train = h('span.train', { 'aria-hidden': 'true' }, trainIcon);
  const count = h('span.ride-count');
  const comboBadge = h('span.combo', { 'aria-live': 'polite' });
  const stage = h('div');
  let cat = null;
  let napTimer = 0;
  // Companion: die gewählte Katze (mit Skin) begleitet die Fahrt und freut sich über richtige Antworten.
  const companion = h('.companion', { 'aria-hidden': 'true', hidden: true });
  const wrap = h('section.ride', { style: { '--line': lineColor } },
    h('.ride-top',
      h('button.icon-btn', { type: 'button', title: 'Fahrt abbrechen', 'aria-label': 'Fahrt abbrechen', onclick: exit }, '✕'),
      h('.track', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total }, h('.rail'), railDone, trackDots, train),
      count),
    comboBadge,
    companion,
    stage);
  root.replaceChildren(wrap);
  loadCompanion();
  window.scrollTo(0, 0);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    } else if (onKey?.(e.key)) {
      e.preventDefault();
    } else if (/^[1-4]$/.test(e.key) && !e.target.matches('input')) {
      stage.querySelectorAll('.options .opt')[Number(e.key) - 1]?.click();
    }
  }, { signal: keys.signal });

  // Zurück-Wischen am Handy fragt nach, statt die Fahrt still zu verlassen.
  const release = guardBack(exit);
  // Führt ein anderer Weg von der Seite weg, räumt die Fahrt trotzdem auf.
  window.addEventListener('hashchange', () => { cleanup(); release(); }, { signal: keys.signal });

  function exit() {
    if (!confirm('Fahrt wirklich abbrechen? Sterne gibt es nur, wenn du am Ziel ankommst.')) return;
    cleanup();
    release(onExit);
  }

  function cleanup() {
    ended = true;
    keys.abort();
    document.querySelectorAll('.sheet, .dock').forEach((el) => el.remove());
    window.speechSynthesis?.cancel();
  }

  // Fehlt der Companion, läuft die Fahrt trotzdem.
  async function loadCompanion() {
    try {
      const child = (await api('/children')).find((c) => c.id === Number(childId));
      if (!child || ended) return;
      cat = { id: child.companion, skin: child.skin };
      companion.hidden = false;
      sleep();
    } catch { /* ohne Companion weiterfahren */ }
  }

  // Die Katze schläft eingerollt, wacht bei einer richtigen Antwort auf und legt sich danach wieder hin.
  function sleep() {
    if (!cat) return;
    companion.classList.remove('cheer');
    companion.innerHTML = sleepSvg(cat.id, cat.skin) ?? '';
  }

  function cheer() {
    if (!cat) return;
    clearTimeout(napTimer);
    companion.classList.remove('cheer');
    companion.innerHTML = avatarSvg(cat.id, cat.skin) ?? '';
    void companion.offsetWidth; // Animation neu starten, auch bei schnell aufeinanderfolgenden Treffern
    companion.classList.add('cheer');
    napTimer = setTimeout(sleep, 2600);
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
    onKey = null;
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
      case 'column': return columnArea(q);
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
      enterkeyhint: 'done',
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
      // Tastatur einklappen, damit die Lösung unten nicht verdeckt ist.
      if (!res.correct) input.blur();
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

  /**
   * Schriftlich rechnen: Ziffern über das eigene Zahlenfeld eintippen (keine Handy-Tastatur, die alles verdeckt).
   * Nach jeder Ziffer springt das Kästchen eine Stelle nach links – wie im Heft von den Einern aus.
   * Überträge sind eine Hilfe zum Merken, gewertet wird nur das Ergebnis.
   */
  function columnArea(q) {
    if (q.op === 'mul') return mulArea(q);
    const maxLen = Math.max(...q.rows.map((r) => r.length));
    // Beim Plus mit Übertrag bleibt links eine Stelle frei – sonst verrät die Breite, ob vorne noch eine Ziffer kommt.
    // Beim Minus wird das Ergebnis nie länger als die obere Zahl.
    const width = q.carry && q.op !== 'sub' ? maxLen + 1 : maxLen;
    const result = new Array(width).fill('');
    const carry = new Array(width).fill('');
    const resCells = [];
    const carryCells = [];
    // Reihenfolge wie im Heft: Ergebnis rechts unten, dann der Übertrag der nächsten Spalte, dann deren Ergebnis …
    const order = [];
    for (let col = width - 1; col >= 0; col--) {
      if (q.carry && col < width - 1) order.push({ row: 'carry', col });
      order.push({ row: 'res', col });
    }
    const idx = (row, col) => order.findIndex((o) => o.row === row && o.col === col);
    let cur = order[0];
    const vals = (row) => (row === 'res' ? result : carry);
    const cellOf = (row, col) => (row === 'res' ? resCells : carryCells)[col];

    let carryKey = null;
    const select = (row, col) => {
      cur = { row, col };
      [...resCells, ...carryCells].forEach((c) => c?.classList.remove('cur'));
      cellOf(row, col)?.classList.add('cur');
      // Im Übertrags-Kästchen heißt die Taste „Weiter“: kein Übertrag, ab zum Ergebnis.
      if (carryKey) carryKey.textContent = row === 'carry' ? 'Weiter' : 'Übertrag';
    };
    const step = (dir) => {
      const o = order[idx(cur.row, cur.col) + dir];
      if (o) select(o.row, o.col);
      return !!o;
    };
    const paint = () => {
      resCells.forEach((c, i) => { c.textContent = result[i]; });
      carryCells.forEach((c, i) => { if (c) c.textContent = carry[i]; });
    };
    // Ein Übertrag ist höchstens 1 (beim Plus mit drei Zahlen 2).
    const maxCarry = q.op === 'sub' ? 1 : q.rows.length - 1;
    const press = (k) => {
      if (busy) return;
      if (/^\d$/.test(k)) {
        // Eine größere Ziffer kann kein Übertrag sein: Das Kind wollte das Ergebnis dieser Spalte schreiben.
        if (cur.row === 'carry' && Number(k) > maxCarry) select('res', cur.col);
        // Übertrag 0 heißt: kein Übertrag – das Kästchen bleibt leer.
        vals(cur.row)[cur.col] = cur.row === 'carry' && k === '0' ? '' : k;
        step(1);
      } else if (k === 'back') {
        // Wie beim Radiergummi: erst das aktuelle Kästchen, sonst das davor –
        // genau rückwärts wie beim Eintippen, also auch durch leere Übertrags-Kästchen.
        if (vals(cur.row)[cur.col]) vals(cur.row)[cur.col] = '';
        else if (step(-1)) vals(cur.row)[cur.col] = '';
      } else if (k === 'carry') {
        if (cur.row === 'carry') step(1);
        else if (carryCells[cur.col]) select('carry', cur.col);
      } else if (k === 'left' || k === 'right') {
        const col = cur.col + (k === 'left' ? -1 : 1);
        if (col >= 0 && col < width) select(cellOf(cur.row, col) ? cur.row : 'res', col);
      }
      paint();
    };
    onKey = (key) => {
      const k = /^\d$/.test(key) ? key
        : { Backspace: 'back', Delete: 'back', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'carry', ArrowDown: 'carry', Tab: q.carry ? 'carry' : null }[key];
      if (!k || (k === 'carry' && !q.carry)) return false;
      press(k);
      return true;
    };

    const grid = columnSum(q.rows, {
      width,
      op: q.op,
      // In die Einer-Spalte kommt nie ein Übertrag.
      carryCell: q.carry
        ? (col) => (carryCells[col] = col < width - 1
            ? h('button.cs-carry.cs-in', { type: 'button', 'aria-label': `Übertrag ${col + 1}. Stelle`, onclick: () => !busy && select('carry', col) })
            : null) ?? h('span.cs-carry')
        : null,
      resultCell: (col) => (resCells[col] = h('button.cs-r.cs-line.cs-in', {
        type: 'button', 'aria-label': `Ergebnis ${col + 1}. Stelle`, onclick: () => !busy && select('res', col),
      })),
    });
    grid.removeAttribute('role');
    grid.removeAttribute('aria-label');

    const key = (label, k, cls = '') => h('button', { type: 'button', class: cls, onclick: () => press(k) }, label);
    if (q.carry) carryKey = key('Übertrag', 'carry', 'k-carry');
    const pad = h('.keypad',
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, d)),
      carryKey ?? h('span'),
      key('0', '0'),
      h('button.k-back', { type: 'button', 'aria-label': 'Löschen', onclick: () => press('back') }, '⌫'));
    select(cur.row, cur.col);

    const check = async () => {
      if (busy) return;
      const typed = result.join('');
      const first = result.findIndex(Boolean);
      // Lücken mitten im Ergebnis sind ein Vertipper, kein Fehler.
      if (!typed || result.slice(first).some((d) => !d)) {
        grid.classList.add('shake');
        setTimeout(() => grid.classList.remove('shake'), 350);
        if (typed) toast('Da fehlt noch eine Ziffer.');
        return;
      }
      const answer = typed.replace(/^0+(?=\d)/, '');
      const m = columnMath(q.rows, { width, op: q.op });
      // Vorne vergessen ist auch ein Vertipper – oft steht die Ziffer im Übertrags-Kästchen darüber.
      if (answer.length < m.total.trim().length) {
        grid.classList.add('shake');
        setTimeout(() => grid.classList.remove('shake'), 350);
        const col = width - answer.length - 1;
        toast(carry[col] ? 'Vorne fehlt noch eine Ziffer. Steht sie oben im kleinen Übertrags-Kästchen?' : 'Vorne fehlt noch eine Ziffer.');
        return select('res', col);
      }
      [...resCells, ...carryCells].forEach((c) => c?.classList.remove('cur'));
      const given = answer.padStart(width, ' ');
      q.entered = answer;
      const res = await submit(q, answer);
      if (!res) return select(cur.row, cur.col);
      // Unter dem Strich steht jetzt die richtige Rechnung: falsche Ziffern rot, Überträge eingeblendet.
      resCells.forEach((c, i) => {
        const want = m.total[i].trim();
        const had = given[i].trim();
        c.textContent = want;
        if (want || had) c.classList.add(had === want ? 'ok' : 'fix');
      });
      if (!res.correct) {
        carryCells.forEach((c, i) => {
          if (!c) return;
          const want = m.carries[i] ? String(m.carries[i]) : '';
          if (want !== carry[i]) c.classList.add('shown');
          c.textContent = want;
        });
      }
    };
    onEnter = check;
    dock(h('button.btn.line.big', { type: 'button', onclick: check }, 'Prüfen'));
    return h('.col-work', grid, pad);
  }

  /**
   * Schriftlich mal: erst die Teilprodukte Zeile für Zeile (jede von rechts nach links), dann das Ergebnis
   * mit Überträgen wie beim Plus. Ist ein Teilprodukt kürzer als sein Platz, springt „Nächste Zeile“ weiter.
   * Gewertet wird nur das Ergebnis; die Zeilen darüber sind der Rechenweg und werden danach mit angezeigt.
   * Bei einstelligem zweiten Faktor gibt es nur die Ergebnis-Zeile.
   */
  function mulArea(q) {
    const m = mulMath(q.rows);
    const { width } = m;
    const multi = m.lb > 1;
    const withCarry = multi && q.carry;
    // Zeilen von oben nach unten: p0, p1, … (Teilprodukte), carry, res
    const rowIds = [...(multi ? m.partials.map((_, i) => `p${i}`) : []), ...(withCarry ? ['carry'] : []), 'res'];
    const vals = Object.fromEntries(rowIds.map((r) => [r, new Array(width).fill('')]));
    const cells = Object.fromEntries(rowIds.map((r) => [r, []]));
    const order = [];
    if (multi) m.partials.forEach((p, i) => { for (let col = p.end; col >= p.start; col--) order.push({ row: `p${i}`, col }); });
    for (let col = width - 1; col >= 1; col--) {
      if (withCarry && col < width - 1) order.push({ row: 'carry', col });
      order.push({ row: 'res', col });
    }
    const idx = (row, col) => order.findIndex((o) => o.row === row && o.col === col);
    let cur = order[0];

    let specialKey = null;
    const select = (row, col) => {
      cur = { row, col };
      Object.values(cells).flat().forEach((c) => c?.classList.remove('cur'));
      cells[row][col]?.classList.add('cur');
      if (specialKey) specialKey.textContent = row === 'carry' ? 'Weiter' : row === 'res' ? 'Übertrag' : 'Nächste Zeile';
    };
    const step = (dir) => {
      const o = order[idx(cur.row, cur.col) + dir];
      if (o) select(o.row, o.col);
      return !!o;
    };
    // „Nächste Zeile“: zur rechten Ziffer der nächsten Zeile – dort fängt man im Heft an.
    const nextRow = () => {
      const o = order.slice(idx(cur.row, cur.col)).find((e) => e.row !== cur.row && e.row !== 'carry');
      if (o) select(o.row, o.col);
    };
    // Pfeil hoch/runter: in die Zeile darüber/darunter, möglichst in derselben Spalte.
    const moveVert = (dir) => {
      const row = rowIds[rowIds.indexOf(cur.row) + dir];
      if (!row) return;
      const cols = cells[row].map((c, col) => (c ? col : null)).filter((c) => c != null);
      const col = cols.includes(cur.col) ? cur.col : cols.reduce((best, c) => (Math.abs(c - cur.col) < Math.abs(best - cur.col) ? c : best));
      select(row, col);
    };
    const paint = () => rowIds.forEach((r) => cells[r].forEach((c, col) => { if (c) c.textContent = vals[r][col]; }));
    const press = (k) => {
      if (busy) return;
      if (/^\d$/.test(k)) {
        // Eine größere Ziffer kann kein Übertrag sein: Das Kind wollte das Ergebnis dieser Spalte schreiben.
        if (cur.row === 'carry' && Number(k) > m.maxCarry) select('res', cur.col);
        vals[cur.row][cur.col] = cur.row === 'carry' && k === '0' ? '' : k;
        step(1);
      } else if (k === 'back') {
        if (vals[cur.row][cur.col]) vals[cur.row][cur.col] = '';
        else if (step(-1)) vals[cur.row][cur.col] = '';
      } else if (k === 'special') {
        if (cur.row === 'carry') step(1);
        else if (cur.row === 'res') { if (cells.carry?.[cur.col]) select('carry', cur.col); }
        else nextRow();
      } else if (k === 'left' || k === 'right') {
        const col = cur.col + (k === 'left' ? -1 : 1);
        if (cells[cur.row][col]) select(cur.row, col);
      } else if (k === 'up' || k === 'down') {
        moveVert(k === 'up' ? -1 : 1);
      }
      paint();
    };
    onKey = (key) => {
      const k = /^\d$/.test(key) ? key
        : { Backspace: 'back', Delete: 'back', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Tab: multi ? 'special' : null }[key];
      if (!k) return false;
      press(k);
      return true;
    };

    const cls = (row) => ({ carry: '.cs-carry', res: '.cs-r.cs-line', p0: '.cs-line' }[row] ?? '');
    const btn = (row, col, label) => (cells[row][col] = h(`button.cs-in${cls(row)}`, {
      type: 'button', 'aria-label': label, onclick: () => !busy && select(row, col),
    }));
    const grid = mulGrid(q.rows, {
      partialCell: (i, col) => btn(`p${i}`, col, `Zeile ${i + 1}, ${col + 1}. Stelle`),
      carryCell: withCarry ? (col) => btn('carry', col, `Übertrag ${col + 1}. Stelle`) : null,
      resultCell: (col) => btn('res', col, `Ergebnis ${col + 1}. Stelle`),
    });
    grid.removeAttribute('role');
    grid.removeAttribute('aria-label');

    const key = (label, k, cls = '') => h('button', { type: 'button', class: cls, onclick: () => press(k) }, label);
    if (multi) specialKey = key('Nächste Zeile', 'special', 'k-carry');
    const pad = h('.keypad',
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, d)),
      specialKey ?? h('span'),
      key('0', '0'),
      h('button.k-back', { type: 'button', 'aria-label': 'Löschen', onclick: () => press('back') }, '⌫'));
    select(cur.row, cur.col);

    const shake = (msg, focus) => {
      grid.classList.add('shake');
      setTimeout(() => grid.classList.remove('shake'), 350);
      if (msg) toast(msg);
      if (focus) select(...focus);
    };
    const check = async () => {
      if (busy) return;
      const result = vals.res;
      const typed = result.join('');
      const first = result.findIndex(Boolean);
      if (!typed) {
        // Teilprodukte stehen schon da, aber unten fehlt noch die Summe.
        const started = rowIds.some((r) => r !== 'res' && vals[r].some(Boolean));
        return shake(started ? 'Jetzt noch die Zeilen zusammenzählen: Das Ergebnis kommt unter den Strich.' : null, ['res', width - 1]);
      }
      if (result.slice(first).some((d) => !d)) return shake('Da fehlt noch eine Ziffer.');
      const answer = typed.replace(/^0+(?=\d)/, '');
      if (answer.length < m.total.length) {
        const col = width - answer.length - 1;
        return shake(vals.carry?.[col] ? 'Vorne fehlt noch eine Ziffer. Steht sie oben im kleinen Übertrags-Kästchen?' : 'Vorne fehlt noch eine Ziffer.', ['res', col]);
      }
      Object.values(cells).flat().forEach((c) => c?.classList.remove('cur'));
      q.entered = answer;
      const res = await submit(q, answer);
      if (!res) return select(cur.row, cur.col);
      // Jetzt steht die richtige Rechnung da: falsche Ziffern rot. Zeilen, die das Kind im Kopf gerechnet hat, grau.
      const mark = (row, want) => {
        const typedRow = vals[row].some(Boolean);
        cells[row].forEach((c, col) => {
          if (!c) return;
          const w = want(col);
          const had = vals[row][col];
          c.textContent = w;
          if (!typedRow) { if (w) c.classList.add('hint'); } else if (w || had) c.classList.add(had === w ? 'ok' : 'fix');
        });
      };
      m.partials.forEach((p, i) => { if (multi) mark(`p${i}`, (col) => m.at(p.value, p.end, col)); });
      mark('res', (col) => m.at(m.total, width - 1, col));
      if (!res.correct && withCarry) {
        cells.carry.forEach((c, col) => {
          if (!c) return;
          const want = m.carries[col] ? String(m.carries[col]) : '';
          if (want !== vals.carry[col]) c.classList.add('shown');
          c.textContent = want;
        });
      }
    };
    onEnter = check;
    dock(h('button.btn.line.big', { type: 'button', onclick: check }, 'Prüfen'));
    return h('.col-work', grid, pad);
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
      if (err.status === 404) { cleanup(); release(onExit); }
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
    if (res.correct) cheer();
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
    const next = () => {
      onEnter = null;
      pos++;
      if (pos < queue.length) show();
      else finish();
    };
    // Richtig: kurz loben und von selbst weiter, damit der Fluss nicht abreißt.
    // Eine Meldung mit „Weiter“ gibt es nur bei Fehlern (auch beim Paare-Finden mit mehreren Fehlgriffen).
    if (res.correct) {
      onEnter = null;
      stage.querySelector('.qcard')?.append(h('span.praise', { 'aria-live': 'polite' },
        q.type === 'match' && res.mistakes ? 'Fast fehlerfrei!' : pick(PRAISE)));
      if (res.note) toast(res.note);
      setTimeout(() => { if (!ended) next(); }, res.note ? 1400 : 900);
      return;
    }
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
      // Beim schriftlichen Rechnen stehen in den Kästchen jetzt die richtigen Ziffern – die eigene Eingabe soll sichtbar bleiben.
      if (q.type === 'column' && q.entered) lines.push(h('p.explain', `Du hast ${q.entered} eingetragen.`));
      lines.push(h('p.solution', { html: `Richtig ist: ${md(res.solution)}` }));
      if (q.type === 'column') lines.push(columnSteps(q.rows, { op: q.op }));
      if (res.reveal) lines.push(h('p.explain', { html: `Das Wort war: <strong>${escapeHtml(res.reveal)}</strong>` }));
      if (res.explain) lines.push(h('div.explain', { html: `<p>${md(res.explain)}</p>` }));
      if (res.firstTry) lines.push(h('p.explain', 'Diese Aufgabe kommt am Ende nochmal.'));
    }
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
    release();
    stage.replaceChildren(h('.loading', 'Einfahrt in den Bahnhof …'));
    const here = location.hash;
    let result;
    try {
      result = await api(`/sessions/${session.sessionId}/finish`, { method: 'POST' });
    } catch (err) {
      stage.replaceChildren(h('.empty', h('p', err.message), h('button.btn', { type: 'button', onclick: onExit }, 'Zurück')));
      return;
    }
    // Inzwischen woanders hin gewechselt? Dann das Ergebnis nicht über die neue Seite legen.
    if (location.hash !== here) return;
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
    const station = result.station;
    if (station?.justRetired) {
      panels.push(h('section.panel.parked-up',
        h('.big-train', { 'aria-hidden': 'true' }, '🅿️'),
        h('div',
          h('h2', 'Ab aufs Abstellgleis!'),
          h('p', `Du hast diese Station ${station.limit}× mit 3 Sternen geschafft – die kannst du! Sie macht jetzt Pause: Ab sofort gibt es hier keine Sterne mehr. Neue Sterne warten auf den anderen Stationen.`))));
    }
    if (result.lootboxes?.length) {
      panels.push(h('section.panel',
        h('h2', result.lootboxes.length === 1 ? '🎁 Du hast eine Lootbox bekommen!' : `🎁 Du hast ${result.lootboxes.length} Lootboxen bekommen!`),
        h('p.muted', 'Darin steckt Medienzeit – wie viel, siehst du erst beim Öffnen. Du kannst sie auch später öffnen.'),
        h('.lootboxes', result.lootboxes.map((b) => lootbox(childId, b, {
          onOpened: (r) => countUp(balanceEl, Number(balanceEl.textContent) || 0, r.balance),
        })))));
    }
    if (result.skins?.length) {
      panels.push(h('section.panel.rank-up',
        h('.big-train', { 'aria-hidden': 'true' }, '🎩'),
        h('div',
          h('h2', result.skins.length === 1 ? `Neuer Skin: ${result.skins[0].name}!` : 'Neue Skins!'),
          h('p', 'Du findest ihn in deiner Sammlung unter „Companion“ und kannst ihn deiner Katze anziehen.'),
          h('a.btn.small', { href: `#/kid/${childId}/sammlung/avatar` }, 'Jetzt anziehen →'))));
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
            station?.parked
              ? h('p.muted', `🅿️ Diese Station steht auf dem Abstellgleis – hier gibt es keine Sterne mehr. Üben darfst du trotzdem! Sterne gibt es auf den anderen Stationen.`)
              : null,
            station?.extraRidesLeft != null
              ? h('p.muted', station.extraRidesLeft > 0
                  ? `🔄 Diese Station ist noch für ${station.extraRidesLeft} ${station.extraRidesLeft === 1 ? 'Fahrt' : 'Fahrten'} mit Sternen in Betrieb.`
                  : '🔄 Das war die letzte Fahrt mit Sternen – jetzt geht die Station zurück aufs Abstellgleis.')
              : null,
            station && !station.parked && !station.justRetired && station.limit > 0 && station.perfect > 0 && station.perfect < station.limit
              ? h('p.muted', `🎁 ${station.perfect} von ${station.limit} Fahrten mit 3 Sternen: Bei ${station.limit} kommt die Station aufs Abstellgleis, und du bekommst eine Lootbox.`)
              : null,
            result.capped > 0 ? h('p.muted', 'Dein Sterne-Limit für heute ist erreicht. Morgen gibt es wieder neue – üben lohnt sich trotzdem!') : null,
            !result.capped && result.runToday >= 2 && ['unit', 'exam'].includes(result.mode)
              ? h('p.muted', result.runToday === 2
                  ? `Deine 2. Fahrt ${result.mode === 'exam' ? 'zu diesem Endbahnhof' : 'auf dieser Station'} heute – dafür gibt es halbe Sterne. Neue Stationen bringen mehr!`
                  : 'Diese Strecke bist du heute schon oft gefahren – jetzt gibt es nur noch 1 Stern. Probier eine andere Station, dort gibt es wieder die vollen Sterne!')
              : null,
            h('p', h('strong', 'Du hast jetzt ', balanceEl, ' Sterne.'))),
      result.newBadges.length
        ? h('section.panel',
            h('h2', result.newBadges.length === 1 ? '🎉 Neues Abzeichen!' : '🎉 Neue Abzeichen!'),
            h('.new-badges', result.newBadges.map((b, i) =>
              h('.badge.pop', { style: { animationDelay: `${0.8 + i * 0.25}s` } },
                h('.medal', { 'aria-hidden': 'true' }, b.icon), h('.bname', b.name), h('.bdesc', b.desc)))))
        : null,
      arrivalActions(result)));
    window.scrollTo(0, 0);
  }

  /** Nach einer geschafften Fahrt geht es zum nächsten Halt, nicht nochmal auf dieselbe Station. */
  function arrivalActions(result) {
    const done = result.exam ? result.exam.passed : result.rating >= 2 || result.station?.parked || result.station?.justRetired;
    const next = result.next && onNext
      ? h('button.btn.big', { type: 'button', class: done ? 'line' : 'ghost', onclick: () => onNext(result.next) },
          `🚉 Nächster Halt: ${result.next.icon} ${result.next.title}${result.next.subject !== subject && result.next.subjectName ? ` (${result.next.subjectName})` : ''}`)
      : null;
    const again = h('button.btn.big', { type: 'button', class: done && next ? 'ghost' : 'line', onclick: onAgain }, '🔁 Nochmal fahren');
    const map = h('button.btn.ghost.big', { type: 'button', onclick: onMap }, '🗺️ Zum Netzplan');
    return h('.actions', done ? [next, again, map] : [again, next, map]);
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
