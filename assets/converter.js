/* ═══════════════════════════════════════════════════════════════
   Le convertisseur PDF → Markdown.
   Partagé par la page vitrine et l'application : un seul exemplaire
   de l'algorithme, donc un seul endroit à corriger.
   ═══════════════════════════════════════════════════════════════ */

// résolu depuis ce module, pas depuis la page qui l'importe :
// la vitrine et l'application ne vivent pas au même niveau
export const PDFJS_PATH = new URL('../vendor/pdfjs/', import.meta.url).href;
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 40;

let pdfjs = null;

/** Charge pdf.js une seule fois, depuis le site : aucune requête tierce. */
export async function loadEngine(base = PDFJS_PATH) {
  if (pdfjs) return pdfjs;
  const mod = await import(base + 'pdf.min.mjs');
  mod.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  pdfjs = mod;
  return pdfjs;
}

/** Convertit un File PDF. `onPage(n, total)` suit l'avancement. */
export async function convert(file, onPage) {
  const t0 = performance.now();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const total = doc.numPages;
  const limit = Math.min(total, MAX_PAGES);

  const pages = [];
  for (let n = 1; n <= limit; n++) {
    pages.push(await readPage(doc, n));
    if (onPage) onPage(n, limit);
  }

  const markdown = pages.map((p) => toMarkdown(p)).filter(Boolean).join('\n\n');
  return {
    name: file.name, bytes: file.size,
    type: classify(pages), total, limit,
    markdown, chars: markdown.length,
    tokens: Math.round(markdown.length / 4),   // ~4 caractères par jeton
    ms: Math.round(performance.now() - t0)
  };
}

/* ── Lecture d'une page : texte positionné + présence d'images ── */
async function readPage(doc, n) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  const view = page.getViewport({ scale: 1 });

  const items = content.items
    .filter((i) => i.str && i.str.trim() !== '')
    // on écarte le texte pivoté (tampons arXiv, filigranes de marge) :
    // il partage les mêmes ordonnées que le corps et le contaminerait.
    .filter((i) => Math.abs(i.transform[1]) <= Math.abs(i.transform[0]) * 0.2)
    .map((i) => ({
      str: i.str,
      x: i.transform[4],
      y: i.transform[5],
      w: i.width,
      h: Math.abs(i.transform[3]) || i.height || 10,
      bold: /bold|black|heavy|semibold/i.test(i.fontName || '')
    }));

  let images = 0;
  if (n <= 5) {
    try {
      const ops = await page.getOperatorList();
      const IMG = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintJpegXObject, pdfjs.OPS.paintInlineImageXObject];
      images = ops.fnArray.filter((f) => IMG.indexOf(f) !== -1).length;
    } catch (_) { /* la détection d'images est optionnelle */ }
  }

  page.cleanup();
  return { items, images, width: view.width, height: view.height };
}

/* ── Classification du document ─────────────────── */
function classify(pages) {
  let text = 0, image = 0;
  pages.forEach((p) => {
    const chars = p.items.reduce((a, i) => a + i.str.trim().length, 0);
    if (chars >= 120) text++;
    else if (p.images > 0) image++;
  });
  if (text === pages.length) return 'native';
  if (text === 0 && image > 0) return 'scanned';
  if (text === 0) return 'image';
  return 'mixed';
}

/* ── Ordre de lecture : lignes, puis colonnes ─────────────────── */
function median(list) {
  if (!list.length) return 0;
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/* Étape 1 : regrouper les fragments par ordonnée. À ce stade une « ligne »
   peut encore chevaucher deux colonnes : c'est l'étape suivante qui tranche. */
function clusterRows(items) {
  const body = median(items.map((i) => i.h)) || 10;
  const tol = Math.max(2, body * 0.5);
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  let cur = null;
  sorted.forEach((it) => {
    if (!cur || Math.abs(cur.y - it.y) > tol) { cur = { y: it.y, parts: [it] }; rows.push(cur); }
    else cur.parts.push(it);
  });
  rows.forEach((r) => r.parts.sort((a, b) => a.x - b.x));
  return rows;
}

function makeLine(parts, y) {
  const h = Math.max(...parts.map((p) => p.h));
  let text = '', prev = null;
  parts.forEach((p) => {
    if (prev && p.x - (prev.x + prev.w) > h * 0.18 && !/\s$/.test(text)) text += ' ';
    text += p.str;
    prev = p;
  });
  return {
    y, x: parts[0].x,
    right: Math.max(...parts.map((p) => p.x + p.w)),
    h, parts,
    bold: parts.every((p) => p.bold),
    text: text.replace(/\s+/g, ' ').trim()
  };
}

/* L'indice après lequel une rangée peut être coupée sans casser un mot :
   il faut un blanc franc de part et d'autre de la gouttière. */
function splitAt(parts, cut) {
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i].x + parts[i].w <= cut && parts[i + 1].x >= cut) return i;
  }
  return -1;
}

/* La gouttière est l'abscisse centrale que le moins de rangées traversent
   d'un seul tenant. Titre, résumé et figures pleine largeur la traversent :
   ils resteront pleine largeur et sépareront les bandes à deux colonnes. */
function findGutter(rows, width, height) {
  if (rows.length < 12) return null;
  let best = null;
  for (let f = 0.35; f <= 0.65; f += 0.01) {
    const cut = width * f;
    let cross = 0, two = 0, top = -Infinity, bottom = Infinity;
    rows.forEach((r) => {
      const right = Math.max.apply(null, r.parts.map((p) => p.x + p.w));
      if (right <= cut || r.parts[0].x >= cut) return;
      if (splitAt(r.parts, cut) >= 0) {
        two++;
        if (r.y > top) top = r.y;
        if (r.y < bottom) bottom = r.y;
      } else cross++;
    });
    if (two < 6 || two < rows.length * 0.3) continue;   // sans rangées doubles, pas de colonnes
    if (cross > rows.length * 0.3) continue;            // trop de texte pleine largeur
    // Un écart entre colonnes d'un tableau ressemble à une gouttière, mais ne
    // court que sur quelques lignes : une vraie gouttière traverse la page.
    if ((top - bottom) < height * 0.45) continue;
    if (!best || cross < best.cross || (cross === best.cross && two > best.two)) {
      best = { cut, cross, two };
    }
  }
  return best ? best.cut : null;
}

/* Ordre de lecture : dans chaque bande, la colonne de gauche puis celle de droite. */
function orderLines(rows, width, height) {
  const cut = findGutter(rows, width, height);
  const lines = [];
  if (cut === null) {
    rows.forEach((r) => lines.push(makeLine(r.parts, r.y)));
    return lines.filter((l) => l.text);
  }

  let left = [], right = [];
  const flush = () => {
    lines.push.apply(lines, left);
    lines.push.apply(lines, right);
    left = []; right = [];
  };

  rows.forEach((r) => {
    const parts = r.parts;
    const edge = Math.max.apply(null, parts.map((p) => p.x + p.w));
    if (edge <= cut) { left.push(makeLine(parts, r.y)); return; }
    if (parts[0].x >= cut) { right.push(makeLine(parts, r.y)); return; }
    const i = splitAt(parts, cut);
    if (i >= 0) {
      left.push(makeLine(parts.slice(0, i + 1), r.y));
      right.push(makeLine(parts.slice(i + 1), r.y));
    } else {
      flush();                                   // rangée pleine largeur : elle clôt la bande
      lines.push(makeLine(parts, r.y));
    }
  });
  flush();
  return lines.filter((l) => l.text);
}

/* ── Reconnaissance de tableaux ─────────── */
function segments(line) {
  const gap = line.h * 1.2;
  const segs = [];
  let cur = null;
  line.parts.forEach((p) => {
    if (!cur || p.x - (cur.right) > gap) {
      cur = { x: p.x, right: p.x + p.w, text: p.str };
      segs.push(cur);
    } else {
      if (p.x - cur.right > line.h * 0.18) cur.text += ' ';
      cur.text += p.str;
      cur.right = p.x + p.w;
    }
  });
  return segs.map((s) => ({ x: s.x, text: s.text.replace(/\s+/g, ' ').trim() })).filter((s) => s.text);
}

function alignedRows(a, b) {
  if (a.length !== b.length || a.length < 3) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i].x - b[i].x) > 10) return false;
  return true;
}

function renderTable(rows) {
  const cell = (t) => t.replace(/\|/g, '\\|');
  const head = rows[0].map((c) => cell(c.text));
  const lines = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
  rows.slice(1).forEach((r) => lines.push('| ' + r.map((c) => cell(c.text)).join(' | ') + ' |'));
  return lines.join('\n');
}

/* ── Titres ───────────────────────────────────────────────────────
   Les ratios absolus ne marchent pas : un article scientifique titre
   à 1,2× le corps, un rapport à 2×. On classe donc les tailles
   réellement présentes sur la page, du plus grand au plus petit. */
function sizeLevels(lines, body) {
  const counts = new Map();
  lines.forEach((l) => {
    const k = Math.round(l.h * 2) / 2;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return Array.from(counts.keys())
    .filter((k) => k >= body * 1.12 && counts.get(k) <= lines.length * 0.3)
    .sort((a, b) => b - a)
    .slice(0, 3);
}

/* Beaucoup d'intertitres ont la taille du corps : ils se signalent
   par une numérotation, des capitales ou une graisse, et par leur brièveté. */
function looksLikeSection(line) {
  const t = line.text;
  if (t.length > 90 || t.length < 2) return false;
  if (/[,;:]$/.test(t)) return false;
  if (/[=%±×→]/.test(t)) return false;                 // une ligne de données n'est pas un titre
  // « 3.1 Résultats » est un intertitre ; « 0.12 ± 0.03% ... » ne l'est pas :
  // le numéro doit être suivi d'un mot commençant par une majuscule.
  const numbered = /^((\d{1,2}(\.\d{1,2}){0,2})|[IVXLCDM]{1,6})[.)]?\s+[A-ZÀ-Ý][\wà-ÿ]/.test(t)
                   && t.split(/\s+/).length <= 12;
  const caps = /[A-ZÀ-Ý]{3}/.test(t) && !/[a-zà-ÿ]{2}/.test(t);
  if (numbered && (line.bold || caps || t.length < 60)) return true;
  if (caps && t.length < 60) return true;
  return line.bold && t.length < 70 && !/\.$/.test(t);
}

/* ── Conversion ───────────────────────────────────────────────── */
function toMarkdown(page) {
  if (!page.items.length) return '';
  const flow = orderLines(clusterRows(page.items), page.width, page.height);
  if (!flow.length) return '';
  const body = median(flow.map((l) => l.h)) || 10;
  const levels = sizeLevels(flow, body);

  const blocks = [];
  let para = [];
  let table = null;
  let prevY = null;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(para.join(' ').replace(/-\s(?=[a-zà-ÿ])/g, ''));
    para = [];
  };
  const flushTable = () => {
    if (table && table.length >= 2) blocks.push(renderTable(table));
    else if (table) para.push(table[0].map((c) => c.text).join(' '));
    table = null;
  };

  for (let i = 0; i < flow.length; i++) {
    const l = flow[i];
    const next = flow[i + 1];
    const segs = segments(l);

    // Tableau : au moins deux lignes consécutives aux colonnes alignées.
    if (segs.length >= 3 && next && alignedRows(segs, segments(next))) {
      flushPara();
      table = table || [];
      table.push(segs);
      prevY = l.y;
      continue;
    }
    if (table) {
      if (segs.length >= 3 && alignedRows(segs, table[table.length - 1])) {
        table.push(segs);
        prevY = l.y;
        continue;
      }
      flushTable();
    }

    const gap = prevY === null ? 0 : prevY - l.y;
    const rank = levels.indexOf(Math.round(l.h * 2) / 2);
    const isHead = (rank >= 0 && l.text.length < 160) ? rank + 1
                 : looksLikeSection(l) ? 3 : 0;
    const bullet = /^([•·▪●◦▸○–—-])\s+/.exec(l.text);
    const numbered = /^(\d{1,2})[.)]\s+/.exec(l.text);

    if (isHead) {
      flushPara();
      blocks.push('#'.repeat(isHead) + ' ' + l.text.replace(/\s*[.:]$/, ''));
    } else if (bullet) {
      flushPara();
      blocks.push('- ' + l.text.slice(bullet[0].length));
    } else if (numbered) {
      flushPara();
      blocks.push(numbered[1] + '. ' + l.text.slice(numbered[0].length));
    } else {
      // un saut vers le haut signale un changement de colonne : on clôt le paragraphe
      if (para.length && (gap > body * 1.9 || gap < -body)) flushPara();
      // césure en fin de ligne : on recolle le mot
      if (para.length && /[a-zà-ÿ]-$/.test(para[para.length - 1])) {
        para[para.length - 1] = para[para.length - 1].slice(0, -1) + l.text;
      } else {
        para.push(l.text);
      }
    }
    prevY = l.y;
  }
  flushTable();
  flushPara();

  // les puces consécutives forment une seule liste, sans ligne vide entre elles
  const isItem = (s) => /^(-|\d{1,2}\.)\s/.test(s);
  return blocks.reduce((acc, b, i) =>
    acc + (i === 0 ? '' : (isItem(b) && isItem(blocks[i - 1]) ? '\n' : '\n\n')) + b, '');
}
