/* ============================================================
   My Library
   Reads a Goodreads library export (CSV), keeps the books on the
   "read" shelf, and shelves them in a candlelit bookcase.
   ============================================================ */
(() => {
  "use strict";

  const STORAGE_KEY = "mylibrary.books.v2";
  const SORT_KEY = "mylibrary.sort";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (id) => document.getElementById(id);
  const els = {
    welcome: $("welcome"),
    bookcase: $("bookcase"),
    wall: $("wall"),
    count: $("count"),
    error: $("error"),
    dropzone: $("dropzone"),
    fileInput: $("fileInput"),
    sampleBtn: $("sampleBtn"),
    resetBtn: $("resetBtn"),
    brand: $("brand"),
    brandBig: $("brandBig"),
    sortbar: $("sortbar"),
    shareBtn: $("shareBtn"),
    toast: $("toast"),
    viewer: $("viewer"),
  };

  let allBooks = [];  // as loaded
  let books = [];     // in current shelf order
  let currentDesigns = [];
  let libSource = null;   // "published" | "upload" | "shared" | "sample"
  const cache = { tierH: 0, lib: null, designs: new Map(), els: new Map() };
  let lastLayoutKey = "";

  /* ============================================================
     Textures — generated once as SVG noise, so wood grain, leather
     and cloth look organic without downloading any images.
     ============================================================ */

  const svgURL = (svg) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

  // Wood: stretched fractal noise, banded into grain, then coloured.
  function wood({ w, h, fx, fy, seed, dark = 0.12, range = 0.36, seams = 0 }) {
    const r = (k, o) => `${(range * k).toFixed(3)} 0 0 0 ${(dark * o).toFixed(3)}`;
    let seamRects = "";
    for (let x = seams; seams && x < w; x += seams) {
      seamRects += `<rect x='${x}' width='2' height='${h}' fill='black' opacity='.55'/><rect x='${x + 2}' width='1' height='${h}' fill='#ffd9a0' opacity='.05'/>`;
    }
    return svgURL(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
      <filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
        <feTurbulence type='fractalNoise' baseFrequency='${fx} ${fy}' numOctaves='5' seed='${seed}' stitchTiles='stitch'/>
        <feColorMatrix type='matrix' values='0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1'/>
        <feComponentTransfer>
          <feFuncR type='table' tableValues='0 .55 .2 .75 .35 .9 .5 1 .62'/>
          <feFuncG type='table' tableValues='0 .55 .2 .75 .35 .9 .5 1 .62'/>
          <feFuncB type='table' tableValues='0 .55 .2 .75 .35 .9 .5 1 .62'/>
        </feComponentTransfer>
        <feColorMatrix type='matrix' values='${r(1, 1)} ${r(0.52, 0.5)} ${r(0.25, 0.22)} 0 0 0 0 1'/>
      </filter>
      <rect width='100%' height='100%' filter='url(#f)'/>${seamRects}
    </svg>`.replace(/\s{2,}/g, " "));
  }

  // Grey noise for blending over a colour (overlay / soft-light).
  function grain({ w, h, fx, fy = fx, seed, octaves = 4, slope = 1.4, type = "fractalNoise", extra = "" }) {
    const icpt = (0.5 - slope * 0.5).toFixed(3);
    return svgURL(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
      <filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
        <feTurbulence type='${type}' baseFrequency='${fx} ${fy}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>
        <feColorMatrix type='matrix' values='0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1'/>
        <feComponentTransfer>
          <feFuncR type='linear' slope='${slope}' intercept='${icpt}'/>
          <feFuncG type='linear' slope='${slope}' intercept='${icpt}'/>
          <feFuncB type='linear' slope='${slope}' intercept='${icpt}'/>
        </feComponentTransfer>
      </filter>
      <rect width='100%' height='100%' filter='url(#f)'/>${extra}
    </svg>`.replace(/\s{2,}/g, " "));
  }

  // Woven book cloth: fine noise plus a faint crosshatch.
  function cloth(seed) {
    let lines = "";
    for (let i = 0; i < 120; i += 3) {
      lines += `<rect y='${i}' width='120' height='1' fill='black' opacity='.13'/><rect x='${i}' width='1' height='120' fill='white' opacity='.07'/>`;
    }
    return grain({ w: 120, h: 120, fx: 0.9, fy: 0.35, seed, octaves: 2, slope: 0.6, extra: lines });
  }

  const TEX = {
    woodH: wood({ w: 700, h: 180, fx: 0.0035, fy: 0.11, seed: 11 }),
    woodV: wood({ w: 180, h: 700, fx: 0.11, fy: 0.0035, seed: 23 }),
    back: wood({ w: 240, h: 600, fx: 0.06, fy: 0.002, seed: 5, dark: 0.07, range: 0.16, seams: 80 }),
    film: grain({ w: 220, h: 220, fx: 0.85, seed: 3, octaves: 2, slope: 1.6 }),
    leather: [
      grain({ w: 180, h: 180, fx: 0.55, seed: 7, slope: 0.75 }),
      grain({ w: 180, h: 180, fx: 0.3, seed: 31, slope: 0.8 }),
      grain({ w: 180, h: 180, fx: 0.7, seed: 44, slope: 0.7 }),
    ],
    cloth: [cloth(9), cloth(17)],
    paper: [
      grain({ w: 200, h: 260, fx: 0.035, seed: 13, octaves: 4, slope: 0.8 }),
      grain({ w: 200, h: 260, fx: 0.05, seed: 29, octaves: 4, slope: 0.7 }),
    ],
    wear: [
      grain({ w: 160, h: 260, fx: 0.018, fy: 0.012, seed: 2, octaves: 3, slope: 1.3 }),
      grain({ w: 160, h: 260, fx: 0.025, fy: 0.01, seed: 8, octaves: 3, slope: 1.4 }),
      grain({ w: 160, h: 260, fx: 0.02, fy: 0.016, seed: 19, octaves: 3, slope: 1.2 }),
    ],
  };

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--tex-wood-h", TEX.woodH);
  rootStyle.setProperty("--tex-wood-v", TEX.woodV);
  rootStyle.setProperty("--tex-back", TEX.back);
  rootStyle.setProperty("--tex-film", TEX.film);

  // Tooled ornaments, used as masks over gold leaf.
  const ORN = [
    `<path d='M10 1 13 10 10 19 7 10Z'/><circle cx='3' cy='10' r='1.7'/><circle cx='17' cy='10' r='1.7'/>`,
    `<circle cx='10' cy='5.6' r='3.4'/><circle cx='10' cy='14.4' r='3.4'/><circle cx='5.6' cy='10' r='3.4'/><circle cx='14.4' cy='10' r='3.4'/>`,
    `<path d='M10 1 12 8 19 10 12 12 10 19 8 12 1 10 8 8Z'/>`,
    `<path d='M10 2C14 6 14 9 10 10 6 9 6 6 10 2ZM10 18C14 14 14 11 10 10 6 11 6 14 10 18ZM2 10C6 8 8 9 10 10 8 11 6 12 2 10ZM18 10C14 8 12 9 10 10 12 11 14 12 18 10Z'/>`,
    `<path d='M1 10 10 4 19 10 10 16Z M5 10 10 7 15 10 10 13Z' fill-rule='evenodd'/>`,
  ].map((p) => svgURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>${p}</svg>`));

  // Hammered cast-metal surface for the name plaque, and its crest ornament.
  rootStyle.setProperty("--tex-hammer", grain({ w: 240, h: 120, fx: 0.11, fy: 0.13, seed: 61, octaves: 3, slope: 1.9 }));
  rootStyle.setProperty("--plaque-orn", ORN[3]);

  // One shared rule per texture; books just reference a class.
  const TEX_GRAINS = [...TEX.leather, ...TEX.cloth, ...TEX.paper];
  document.head.appendChild(Object.assign(document.createElement("style"), {
    textContent: [
      ...TEX_GRAINS.map((u, i) => `.g${i}{--grain:${u}}`),
      ...TEX.wear.map((u, i) => `.w${i}{--wear:${u}}`),
      ...ORN.map((u, i) => `.o${i}{--orn:${u}}`),
    ].join("\n"),
  }));

  /* ============================================================
     CSV
     ============================================================ */

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  const toNum = (v) => {
    const n = parseFloat(String(v || "").trim());
    return Number.isFinite(n) ? n : null;
  };
  const cleanIsbn = (v) => String(v || "").replace(/[^0-9X]/gi, "");
  const toInt = (v) => {
    const n = parseInt(String(v || "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  const toDate = (v) => {
    const s = String(v || "").trim();
    if (!s) return null;
    const t = Date.parse(s.replace(/\//g, "-"));
    return Number.isFinite(t) ? t : null;
  };

  function booksFromCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("That file looks empty.");
    const header = rows[0].map((h) => h.trim());
    const col = (name) => header.indexOf(name);
    const iTitle = col("Title"), iAuthor = col("Author"), iShelf = col("Exclusive Shelf");
    if (iTitle < 0 || iAuthor < 0 || iShelf < 0) {
      throw new Error("This doesn't look like a Goodreads library export. Look for a file named goodreads_library_export.csv.");
    }
    const get = (r, name) => { const i = col(name); return i < 0 ? "" : (r[i] || "").trim(); };

    const out = [];
    for (const r of rows.slice(1)) {
      if ((r[iShelf] || "").trim().toLowerCase() !== "read") continue;
      out.push({
        id: get(r, "Book Id") || `${r[iTitle]}|${r[iAuthor]}`,
        title: (r[iTitle] || "").trim(),
        author: (r[iAuthor] || "").trim(),
        authorSort: get(r, "Author l-f") || (r[iAuthor] || "").trim(),
        // Goodreads now allows quarter stars (e.g. 4.25)
        rating: toNum(get(r, "My Rating")) || 0,
        avgRating: toNum(get(r, "Average Rating")),
        review: get(r, "My Review"),
        pages: toInt(get(r, "Number of Pages")),
        isbn: cleanIsbn(get(r, "ISBN13")) || cleanIsbn(get(r, "ISBN")),
        yearPublished: toInt(get(r, "Original Publication Year")) ?? toInt(get(r, "Year Published")),
        dateRead: toDate(get(r, "Date Read")),
        dateAdded: toDate(get(r, "Date Added")),
      });
    }
    if (!out.length) throw new Error("No books on your “read” shelf were found in that file.");
    return out;
  }

  /* ============================================================
     Sorting
     ============================================================ */

  const titleKey = (b) => b.title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
  const readKey = (b) => b.dateRead ?? b.dateAdded ?? null;
  // Each option: a key, and its natural direction (1 = ascending, -1 = descending).
  const SORTS = {
    // order: how each direction reads in the menu, [ascending, descending]
    read:      { label: "Date read",      dir: -1, key: readKey,  order: ["Oldest first", "Newest first"] },
    title:     { label: "Title",          dir: 1,  key: titleKey, order: ["A to Z", "Z to A"] },
    author:    { label: "Author",         dir: 1,  key: (b) => b.authorSort.toLowerCase(), order: ["A to Z", "Z to A"] },
    published: { label: "Year published", dir: 1,  key: (b) => b.yearPublished, order: ["Oldest first", "Newest first"] },
    rating:    { label: "My rating",      dir: -1, key: (b) => (b.rating || null), order: ["Lowest first", "Highest first"] },
  };
  let sortState = { by: "read", dir: -1 };

  function sortBooks(list, by, dir) {
    const { key } = SORTS[by];
    return list.slice().sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka == null && kb == null) return titleKey(a).localeCompare(titleKey(b));
      if (ka == null) return 1;            // missing values always go last
      if (kb == null) return -1;
      const c = typeof ka === "string" ? ka.localeCompare(kb) : ka - kb;
      return c * dir || titleKey(a).localeCompare(titleKey(b));
    });
  }

  /* ============================================================
     Stable randomness per book
     ============================================================ */

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed || 1;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function weighted(r, table) {
    let x = r() * table.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of table) { if ((x -= w) < 0) return v; }
    return table[0][0];
  }

  /* ============================================================
     Spine design
     ============================================================ */

  const LEATHER = ["#7a2418", "#8a3a1c", "#9a5424", "#6a3a1c", "#5a3418", "#24503a", "#3e5a34",
                   "#24365a", "#2e241c", "#7e2a34", "#94401c", "#8e5a2a", "#7a4422", "#1f4a46"];
  const CLOTH = ["#2c3e5c", "#2f5040", "#6e2426", "#6a6230", "#46525c", "#9a4a2e", "#2a5456", "#563a52", "#7c6440"];
  const VELLUM = ["#cdb98d", "#c4a874", "#d8c8a0", "#b89464", "#bfae88"];
  const LABELS = ["#15110e", "#5a1712", "#183022", "#141c2c"];
  const FONTS = [
    { family: "Cinzel", weight: 700 },
    { family: "Libre Caslon Text", weight: 700 },
    { family: "Playfair Display", weight: 700 },
    { family: "IM Fell English SC", weight: 400 },
    { family: "Cinzel", weight: 500 },
  ];

  function spineTitle(title) {
    let t = title.replace(/\s*\([^)]*#[\d.]+[^)]*\)\s*$/, "").trim();
    const sub = t.search(/[:;]\s/);
    if (sub > 2 && t.length > 28) t = t.slice(0, sub);
    return t || title;
  }
  function surname(book) {
    if (book.authorSort.includes(",")) return book.authorSort.split(",")[0].trim();
    const parts = book.author.split(/\s+/);
    return parts[parts.length - 1] || book.author;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  function textLen(text, font, spacingEm = 0, size = 0) {
    ctx.font = font;
    return ctx.measureText(text).width + spacingEm * size * text.length;
  }
  function wrap(words, font, avail, maxLines) {
    const lines = [];
    let cur = "";
    for (const w of words) {
      if (textLen(w, font) > avail) return null;
      const next = cur ? cur + " " + w : w;
      if (textLen(next, font) <= avail) cur = next;
      else { lines.push(cur); cur = w; if (lines.length >= maxLines) return null; }
    }
    if (cur) lines.push(cur);
    return lines.length <= maxLines ? lines : null;
  }
  function forceWrap(text, font, avail, maxLines) {
    const lines = [];
    let rest = text;
    while (rest && lines.length < maxLines) {
      let n = rest.length;
      while (n > 1 && textLen(rest.slice(0, n), font) > avail) n--;
      if (lines.length === maxLines - 1 && n < rest.length) {
        let s = rest.slice(0, n);
        while (s.length > 1 && textLen(s + "…", font) > avail) s = s.slice(0, -1);
        lines.push(s.trimEnd() + "…");
        return lines;
      }
      const cut = rest.slice(0, n);
      const sp = n < rest.length ? cut.lastIndexOf(" ") : -1;
      const take = sp > 3 ? sp : n;
      lines.push(rest.slice(0, take).trim());
      rest = rest.slice(take).trim();
    }
    return lines;
  }

  // Head decoration for each binding style; the tail mirrors it.
  // pad = how much of the spine (top and bottom) the decoration uses.
  const STYLES = {
    antique: { pad: 50, deco: [["rib", 8], ["orn", 21], ["rib", 39]] },
    banded:  { pad: 34, deco: [["rib", 9], ["rib", 22]] },
    cloth:   { pad: 26, deco: [["rules", 10]] },
    vellum:  { pad: 22, deco: [["rules", 9]] },
    plain:   { pad: 14, deco: [] },
  };
  const FIT_STEPS = [[14, 1], [13, 1], [13, 2], [12, 2], [12, 3], [11, 3], [10.5, 3]];

  function designBook(book, tierH) {
    const r = rng(hash(book.id + "|" + book.title));
    let style = weighted(r, [["antique", 34], ["banded", 16], ["cloth", 28], ["vellum", 10], ["plain", 12]]);

    let color, material, gilt = true, t = null;
    if (style === "vellum") {
      color = pick(r, VELLUM); material = "paper"; gilt = false;
      t = pick(r, ["#2a1a0e", "#3a120c", "#1c1a17"]);
    } else if (style === "cloth") {
      color = pick(r, CLOTH); material = "cloth";
      if (r() < 0.25) { gilt = false; t = "#e0d3b4"; }
    } else {
      color = pick(r, LEATHER); material = "leather";
    }
    const font = pick(r, FONTS);
    const labelled = gilt && (style === "antique" || style === "banded") && r() < 0.4;
    const h = Math.round(tierH * (0.7 + r() * 0.24));
    const display = spineTitle(book.title);
    const words = display.split(/\s+/).filter(Boolean);

    // Fit the title; if the decoration leaves too little room, simplify it.
    let size, lines, avail;
    const order = [style, style === "antique" ? "banded" : null, "plain"].filter(Boolean);
    for (const s of order) {
      avail = h - STYLES[s].pad * 2 - (labelled ? 22 : 0);
      for (const [fs, maxLines] of FIT_STEPS) {
        if (s === style && maxLines === 3 && order.length > 1 && fs < 12) break;
        const l = wrap(words, `${font.weight} ${fs}px "${font.family}"`, avail, maxLines);
        if (l) { size = fs; lines = l; break; }
      }
      if (lines) { style = s; break; }
    }
    if (!lines) {
      style = "plain";
      avail = h - STYLES.plain.pad * 2 - (labelled ? 22 : 0);
      size = 10.5;
      lines = forceWrap(display, `${font.weight} ${size}px "${font.family}"`, avail, 3);
    }

    const fontStr = `${font.weight} ${size}px "${font.family}"`;
    const longest = Math.max(...lines.map((l) => textLen(l, fontStr)));
    const lineH = size * 1.12;

    const sur = surname(book);
    const authorLen = textLen(sur.toUpperCase(), `500 8.5px "Cinzel"`, 0.08, 8.5);
    const showAuthor = !labelled && lines.length === 1 && avail - longest >= authorLen + 20 && authorLen < 50;

    const thickness = book.pages ? Math.min(16, book.pages / 60) : r() * 9;
    const w = Math.round(Math.max(26, lines.length * lineH + 14 + (labelled ? 10 : 0) + thickness * 0.7 + r() * 6));

    const tex = material === "leather" ? pick(r, TEX.leather) : material === "cloth" ? pick(r, TEX.cloth) : pick(r, TEX.paper);
    const out = {
      h, w, lines, size, lineH, font, style, gilt, t, labelled, color, sur, showAuthor,
      label: labelled ? pick(r, LABELS) : null,
      orn: pick(r, ORN),
      tex,
      texSize: material === "paper" ? "200px 260px" : material === "cloth" ? "60px 60px" : "180px 180px",
      wear: pick(r, TEX.wear),
      wearPos: `${Math.round(r() * 160)}px ${Math.round(r() * 260)}px`,
      grainPos: `${Math.round(r() * 180)}px ${Math.round(r() * 180)}px`,
      goldA: (0.72 + r() * 0.26).toFixed(2),
      sat: (0.92 + r() * 0.3).toFixed(2),
      texA: material === "paper" ? 0.86 : (0.56 + r() * 0.1).toFixed(2),
    };
    out.color = saturate(out.color, Number(out.sat));
    return out;
  }

  // Scale a hex colour's saturation (done once here instead of a CSS filter
  // on every book, which made animations stutter).
  function saturate(hex, k) {
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    s = Math.min(1, s * k);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    const rgb = s === 0 ? [l, l, l] : [f(h + 1 / 3), f(h), f(h - 1 / 3)];
    return "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  }

  function bookEl(book, d) {
    const el = document.createElement("div");
    el.className = `book ${d.gilt ? "gilt" : "inked"}${d.labelled ? " labelled" : ""} ` +
      `g${TEX_GRAINS.indexOf(d.tex)} w${TEX.wear.indexOf(d.wear)} o${ORN.indexOf(d.orn)}`;
    const pad = STYLES[d.style].pad;
    el.style.cssText =
      `width:${d.w}px;height:${d.h}px;padding:${pad}px 0;--c:${d.color};` +
      (d.t ? `--t:${d.t};` : "") +
      `--grain-size:${d.texSize};--grain-pos:${d.grainPos};` +
      `--wear-pos:${d.wearPos};--gold-a:${d.goldA};--tex-a:${d.texA};` +
      (d.label ? `--label:${d.label};` : "");
    el.title = `${book.title} — ${book.author}`;
    el.dataset.id = book.id;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${book.title} by ${book.author}. Open details`);

    // Decorations at the head, mirrored at the tail.
    for (const [kind, y] of STYLES[d.style].deco) {
      for (const end of ["top", "bottom"]) {
        const s = document.createElement("span");
        s.className = kind === "rib" ? (d.gilt ? "rib gilt-edge" : "rib") : kind;
        const size = kind === "orn" ? Math.min(14, d.w - 12) : kind === "rib" ? 7 : 6;
        if (kind === "orn") s.style.setProperty("--orn-w", size + "px");
        s.style[end] = (y - size / 2) + "px";
        el.appendChild(s);
      }
    }

    const wrapEl = document.createElement("div");
    wrapEl.className = "title-wrap";
    const plate = document.createElement("span");
    plate.className = "plate";
    const t = document.createElement("span");
    t.className = "title";
    t.style.font = `${d.font.weight} ${d.size}px "${d.font.family}"`;
    t.style.setProperty("--lh", d.lineH.toFixed(2) + "px");
    t.textContent = d.lines.join("\n");
    plate.appendChild(t);
    wrapEl.appendChild(plate);
    el.appendChild(wrapEl);

    if (d.showAuthor) {
      const a = document.createElement("span");
      a.className = "author";
      a.textContent = d.sur;
      el.appendChild(a);
    }
    return el;
  }

  /* ============================================================
     Bookcase layout + candlelight
     ============================================================ */

  function cssPx(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  }
  const make = (cls) => Object.assign(document.createElement("div"), { className: cls });

  /*
   * The wall has three parts:
   *   .structure  shelves, boards and columns (rebuilt only when the size changes)
   *   .books      every spine, absolutely positioned, each on its own GPU layer.
   *               Spines are created once and never moved in the DOM; sorting
   *               only changes their left/top, so nothing needs repainting.
   *   .lights     darkness, candle light pools and sconces
   */
  let parts = null;

  function layout(force) {
    if (!books.length || els.bookcase.hidden) return;
    const W = els.wall.clientWidth;
    if (W < 200) return;   // not visible yet; the ResizeObserver lays out once it is
    const bays = W < 560 ? 1 : W < 900 ? 2 : W < 1250 ? 3 : 4;
    const tierH = cssPx("--tier-h");
    const boardH = cssPx("--board-h");
    const pil = cssPx("--pilaster-w");
    const key = `${W}|${tierH}|${books.length}`;
    if (!force && key === lastLayoutKey) return;
    const structural = key !== lastLayoutKey || !parts;
    lastLayoutKey = key;

    if (cache.tierH !== tierH || cache.lib !== allBooks) {
      cache.tierH = tierH; cache.lib = allBooks;
      cache.designs.clear(); cache.els.clear();
      if (parts) parts.books.replaceChildren();
    }
    if (!parts) {
      parts = { structure: make("structure"), books: make("books"), lights: make("lights") };
      els.wall.replaceChildren(parts.structure, parts.books, parts.lights);
    }

    const edge = pil - 8;
    const bayW = (W - 2 * edge - (bays - 1) * pil) / bays;
    const bayInner = Math.floor(bayW) - 16;

    const designs = books.map((b) => {
      let d = cache.designs.get(b.id);
      if (!d) { d = designBook(b, tierH); cache.designs.set(b.id, d); }
      return d;
    });
    currentDesigns = designs;

    const shelves = [];
    let cur = [], used = 0;
    designs.forEach((d, i) => {
      if (used + d.w + 1 > bayInner && cur.length) { shelves.push(cur); cur = []; used = 0; }
      cur.push(i); used += d.w + 1;
    });
    if (cur.length) shelves.push(cur);
    while (shelves.length % bays) shelves.push([]);
    const tiers = shelves.length / bays;

    if (structural) {
      const frag = document.createDocumentFragment();
      for (let t = 0; t < tiers; t++) {
        const tier = make("tier");
        tier.appendChild(make("pilaster edge"));
        for (let b = 0; b < bays; b++) {
          const bay = make("bay");
          bay.append(make("shelf-space"), make("board"));
          tier.append(bay, make(b === bays - 1 ? "pilaster edge" : "pilaster"));
        }
        frag.appendChild(tier);
      }
      parts.structure.replaceChildren(frag);
    }

    // Place every spine by arithmetic: no measuring needed.
    shelves.forEach((idxs, s) => {
      const t = Math.floor(s / bays), b = s % bays;
      const r = rng(hash(`bay${t}-${b}`));
      let x = edge + b * (bayW + pil) + 8;
      const floor = t * (tierH + boardH) + tierH;
      let usedW = 0;
      idxs.forEach((i, k) => {
        const book = books[i], d = designs[i];
        let el = cache.els.get(book.id);
        if (!el) { el = bookEl(book, d); cache.els.set(book.id, el); parts.books.appendChild(el); }
        else {
          el.getAnimations().forEach((a) => a.cancel());
          el.classList.remove("lean", "flying", "pulled");
          el.style.removeProperty("--lean");
        }
        el.dataset.idx = i;
        // leaning book: last on a roomy shelf
        const isLast = k === idxs.length - 1;
        if (isLast && idxs.length > 2) {
          const angle = 5 + r() * 5;
          if (bayInner - usedW - d.w > d.h * Math.sin(angle * Math.PI / 180) + 8 && r() < 0.75) {
            el.classList.add("lean");
            el.style.setProperty("--lean", angle.toFixed(1) + "deg");
            x += 3;
          }
        }
        el.style.left = Math.round(x) + "px";   // whole pixels: no repaint when moved
        el.style.top = Math.round(floor - d.h) + "px";
        x += d.w + 1;
        usedW += d.w + 1;
      });
    });

    if (structural) placeCandles(bays, tiers, tierH);
  }

  // Sconces sit on the columns in a checkerboard; light falls off away from them.
  function placeCandles(bays, tiers, tierH) {
    const wallRect = els.wall.getBoundingClientRect();
    const lights = [];
    parts.structure.querySelectorAll(".tier").forEach((tier, t) => {
      const pilasters = tier.querySelectorAll(".pilaster");
      const candidates = bays > 1
        ? [...pilasters].slice(1, -1).map((p, i) => ({ p, i: i + 1 }))
        : [{ p: pilasters[t % 2 ? pilasters.length - 1 : 0], i: t % 2 }];
      const tr = tier.getBoundingClientRect();
      candidates.forEach(({ p, i }) => {
        if (bays > 1 && (t + i) % 2 === 0) return;
        if (bays === 1 && t % 2 === 1 && tiers > 2 && t % 4 === 3) return;
        const pr = p.getBoundingClientRect();
        lights.push({ x: pr.left - wallRect.left + pr.width / 2, y: tr.top - wallRect.top + tierH * 0.52 });
      });
    });

    const frag = document.createDocumentFragment();

    // Darkness everywhere except near a candle: one static layer whose mask
    // has a clear hole around each flame (holes combine by intersection).
    const dark = make("dark");
    const holes = lights.map((l) =>
      `radial-gradient(circle 330px at ${l.x}px ${l.y - 20}px, transparent 0, transparent 18%, rgba(0,0,0,0.55) 55%, #000 100%)`).join(",");
    if (holes) {
      dark.style.webkitMaskImage = holes;
      dark.style.maskImage = holes;
    }
    frag.appendChild(dark);

    lights.forEach((l, i) => {
      const r = rng(hash(`pool${i}`));
      const pool = make("pool");
      pool.style.left = l.x + "px";
      pool.style.top = (l.y - 30) + "px";
      pool.style.animationDuration = (2.4 + r() * 1.6).toFixed(2) + "s";
      pool.style.animationDelay = `-${(r() * 3).toFixed(2)}s`;
      frag.appendChild(pool);
    });

    lights.forEach((l, i) => {
      const s = make("sconce");
      s.style.left = l.x + "px";
      s.style.top = l.y + "px";
      s.innerHTML = '<span class="halo"></span><span class="plate"></span><span class="arm"></span>' +
        '<span class="candle"></span><span class="wick"></span><span class="flame"></span><span class="cup"></span>';
      const delay = (0.25 + i * 0.18).toFixed(2) + "s";
      const flame = s.querySelector(".flame"), halo = s.querySelector(".halo");
      flame.style.transitionDelay = delay;
      flame.style.animationDelay = `-${(i * 0.37) % 1.3}s`;
      halo.style.transitionDelay = delay;
      halo.style.animationDelay = `-${(i * 0.53) % 2.1}s`;
      frag.appendChild(s);
    });

    frag.appendChild(make("shade"));
    parts.lights.replaceChildren(frag);
  }

  /* ============================================================
     Screens
     ============================================================ */

  function lightUp() {
    const bc = els.bookcase;
    bc.classList.remove("lit");
    void bc.offsetWidth;
    bc.classList.add("lit");
  }

  async function showLibrary(list, { light = true } = {}) {
    allBooks = list;
    books = sortBooks(list, sortState.by, sortState.dir);
    renderSortbar();
    els.sortbar.hidden = false;
    els.welcome.hidden = true;
    els.bookcase.hidden = false;
    els.resetBtn.hidden = false;
    els.shareBtn.hidden = false;
    els.count.textContent = `${books.length.toLocaleString()} book${books.length === 1 ? "" : "s"} read`;
    await fontsReady();
    layout(true);
    if (light) lightUp();
  }

  function showWelcome() {
    books = [];
    els.wall.replaceChildren();
    parts = null;
    cache.lib = null;
    els.bookcase.hidden = true;
    els.bookcase.classList.remove("lit");
    els.resetBtn.hidden = true;
    els.shareBtn.hidden = true;
    els.count.textContent = "";
    els.sortbar.hidden = true;
    els.welcome.hidden = false;
    lastLayoutKey = "";
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = !msg;
  }

  function save(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* full or blocked */ } }
  function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } }
  function clearSaved() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }

  let fontsPromise;
  function fontsReady() {
    if (!fontsPromise) {
      const loads = ['700 14px "Cinzel"', '500 14px "Cinzel"', '700 14px "Libre Caslon Text"',
        '700 14px "Playfair Display"', '400 14px "IM Fell English SC"']
        .map((f) => document.fonts.load(f).catch(() => {}));
      fontsPromise = Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
    }
    return fontsPromise;
  }

  async function handleText(text, persist) {
    showError("");
    try {
      const list = booksFromCSV(text);
      if (persist) save(list);
      libSource = persist ? "upload" : "sample";
      previous = null;
      $("backBtn").hidden = true;
      setOwner(pendingOwner, { persist });
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      await showLibrary(list);
    } catch (e) {
      showError(e.message || "Couldn't read that file.");
    }
  }

  function readFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      showError("Please choose the .csv file Goodreads gives you.");
      return;
    }
    const fr = new FileReader();
    fr.onload = () => handleText(String(fr.result), true);
    fr.onerror = () => showError("Couldn't read that file.");
    fr.readAsText(file);
  }

  /* ============================================================
     Intro: the title fills the dark room, then glides up into the
     header while the candles are lit.
     ============================================================ */

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let introAnims = [];
  let introSkipped = false;

  async function playIntro(onLight) {
    const body = document.body;
    if (reduceMotion) { body.classList.remove("intro"); onLight(); return; }

    const big = els.brandBig;
    const script = big.querySelector(".brand-script");
    const caps = big.querySelector(".brand-caps");
    const track = (a) => { introAnims.push(a); if (introSkipped) a.finish(); return a; };

    track(caps.animate(
      [{ opacity: 0, transform: "scale(1.14, 1)", filter: "blur(10px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: 1700, easing: "cubic-bezier(.2,.6,.2,1)", fill: "both" }));
    track(script.animate(
      [{ opacity: 0, clipPath: "inset(-40% 100% -40% -40%)" }, { opacity: 1, clipPath: "inset(-40% -40% -40% -40%)" }],
      { duration: 1100, delay: 650, easing: "ease-in-out", fill: "both" }));
    await Promise.all(introAnims.map((a) => a.finished));
    if (!introSkipped) await wait(650);

    const from = big.getBoundingClientRect();
    const to = els.brand.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const s = to.width / from.width;
    const move = track(big.animate(
      [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }],
      { duration: 1700, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" }));

    setTimeout(onLight, introSkipped ? 0 : 700);
    await move.finished;
    body.classList.remove("intro");
  }

  function skipIntro() {
    if (!document.body.classList.contains("intro")) return;
    introSkipped = true;
    introAnims.forEach((a) => a.finish());
  }
  window.addEventListener("pointerdown", skipIntro);
  window.addEventListener("keydown", skipIntro);

  /* ============================================================
     Sort bar + shuffle animation
     ============================================================ */

  const sortEls = { trigger: $("sortTrigger"), current: $("sortCurrent"), menu: $("sortMenu") };
  const orderLabel = (by, dir) => SORTS[by].order[dir === 1 ? 0 : 1];

  // Trigger shows the current order; the menu lists fields, then direction.
  function renderSortbar() {
    const { by, dir } = sortState;
    sortEls.current.textContent = `${SORTS[by].label} \u00b7 ${orderLabel(by, dir)}`;
    sortEls.trigger.setAttribute("aria-label", `Sort. Currently ${SORTS[by].label}, ${orderLabel(by, dir)}`);

    const item = (text, checked, data) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sort-item";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(checked));
      b.tabIndex = -1;
      Object.assign(b.dataset, data);
      b.textContent = text;
      return b;
    };
    const head = (text) => Object.assign(document.createElement("p"), { className: "sort-head", textContent: text });
    const group = (label, kids) => {
      const g = document.createElement("div");
      g.setAttribute("role", "group");
      g.setAttribute("aria-label", label);
      g.append(head(label), ...kids);
      return g;
    };
    sortEls.menu.replaceChildren(
      group("Sort by", Object.entries(SORTS).map(([k, o]) => item(o.label, k === by, { by: k }))),
      Object.assign(document.createElement("div"), { className: "sort-sep" }),
      group("Order", [1, -1].map((d) => item(orderLabel(by, d), d === dir, { dir: String(d) }))),
    );
  }

  const menuItems = () => [...sortEls.menu.querySelectorAll(".sort-item")];
  function openSortMenu() {
    sortEls.menu.hidden = false;
    sortEls.trigger.setAttribute("aria-expanded", "true");
    els.sortbar.classList.add("open");
    (sortEls.menu.querySelector('[aria-checked="true"]') || menuItems()[0]).focus();
  }
  function closeSortMenu(refocus) {
    if (sortEls.menu.hidden) return;
    sortEls.menu.hidden = true;
    sortEls.trigger.setAttribute("aria-expanded", "false");
    els.sortbar.classList.remove("open");
    if (refocus) sortEls.trigger.focus();
  }

  sortEls.trigger.addEventListener("click", () => (sortEls.menu.hidden ? openSortMenu() : closeSortMenu(true)));
  sortEls.menu.addEventListener("click", (e) => {
    const it = e.target.closest(".sort-item");
    if (!it) return;
    const next = it.dataset.by
      ? { by: it.dataset.by, dir: it.dataset.by === sortState.by ? sortState.dir : SORTS[it.dataset.by].dir }
      : { by: sortState.by, dir: Number(it.dataset.dir) };
    closeSortMenu(true);
    if (next.by === sortState.by && next.dir === sortState.dir) return;
    sortState = next;
    applySort();
  });
  sortEls.menu.addEventListener("keydown", (e) => {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); closeSortMenu(true); }
    else if (e.key === "Tab") closeSortMenu(false);
  });
  sortEls.trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && sortEls.menu.hidden) { e.preventDefault(); openSortMenu(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!sortEls.menu.hidden && !els.sortbar.contains(e.target)) closeSortMenu(false);
  });

  function applySort() {
    try { localStorage.setItem(SORT_KEY, JSON.stringify(sortState)); } catch { /* ignore */ }
    if (viewer.open) closeViewer(true);

    // FLIP: remember where every book was, re-shelve, then fly them over.
    const before = new Map();
    els.wall.querySelectorAll(".book").forEach((b) => before.set(b.dataset.id, b.getBoundingClientRect()));
    books = sortBooks(allBooks, sortState.by, sortState.dir);
    renderSortbar();
    layout(true);
    if (reduceMotion) return;

    // Read phase: where each book is now.
    const onScreen = (r) => r.bottom > 0 && r.top < innerHeight;
    const moves = [];
    els.wall.querySelectorAll(".book").forEach((b, i) => {
      const o = before.get(b.dataset.id);
      if (!o) return;
      const n = b.getBoundingClientRect();
      const dx = o.left - n.left, dy = o.top - n.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      // Only animate what can be seen; the rest simply appear in place.
      if (!onScreen(o) && !onScreen(n)) return;
      moves.push({ b, i, dx, dy });
    });

    // Write phase: start every flight.
    let order = 0;
    for (const { b, dx, dy } of moves) {
      const r = rng(hash(b.dataset.id + sortState.by + sortState.dir));
      const lean = b.classList.contains("lean") ? `rotate(${b.style.getPropertyValue("--lean")})` : "none";
      const lift = 18 + r() * 30;
      const tilt = (r() - 0.5) * 8;
      b.classList.add("flying");
      b.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx}px, ${dy - 10}px) rotate(${tilt * 0.3}deg)`, offset: 0.15 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) rotate(${tilt}deg)`, offset: 0.55 },
        { transform: lean },
      ], {
        duration: 650 + r() * 250,
        delay: Math.min(order++ * 4, 350) + r() * 80,
        easing: "cubic-bezier(.45,0,.25,1)",
        fill: "backwards",
      }).finished.then(() => b.classList.remove("flying"), () => {});
    }
  }


  /* ============================================================
     Book viewer: the book is drawn off the shelf, turns face-on,
     and shows its title, author, ratings and review.
     ============================================================ */

  const v = {
    root: els.viewer,
    backdrop: $("vBackdrop"),
    cover: $("vCover"),
    panel: $("vPanel"),
    pos: $("vPos"),
    title: $("vTitle"),
    author: $("vAuthor"),
    mine: $("vMine"),
    community: $("vCommunity"),
    meta: $("vMeta"),
    review: $("vReview"),
    link: $("vLink"),
    close: $("vClose"),
    prev: $("vPrev"),
    next: $("vNext"),
  };
  const viewer = { open: false, idx: -1, busy: false };

  const shelfEl = (idx) => els.wall.querySelector(`.book[data-idx="${idx}"]`);
  const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtNum = (n) => (Math.round(n * 100) / 100).toString();

  function starsEl(value) {
    const s = document.createElement("span");
    s.className = "stars";
    s.style.setProperty("--pct", `${Math.max(0, Math.min(5, value)) / 5 * 100}%`);
    s.setAttribute("aria-hidden", "true");
    return s;
  }
  function ratingLine(value, note) {
    const frag = document.createDocumentFragment();
    frag.appendChild(starsEl(value));
    const num = document.createElement("span");
    num.className = "rating-num";
    num.textContent = fmtNum(value);
    frag.appendChild(num);
    if (note) frag.appendChild(Object.assign(document.createElement("span"), { className: "rating-note", textContent: note }));
    return frag;
  }

  // Goodreads reviews contain <br/>, <spoiler> and the odd <i>/<b>; rebuild
  // them as plain DOM nodes so nothing from the file is injected as HTML.
  function renderReview(html, target) {
    target.replaceChildren();
    if (!html) {
      target.appendChild(Object.assign(document.createElement("p"), { className: "no-review", textContent: "No review written for this one." }));
      return;
    }
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const walk = (node, into) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { into.appendChild(document.createTextNode(n.textContent)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        if (tag === "br") into.appendChild(document.createElement("br"));
        else if (tag === "spoiler") {
          const sp = document.createElement("button");
          sp.type = "button";
          sp.className = "spoiler";
          sp.title = "Spoiler — click to reveal";
          walk(n, sp);
          sp.addEventListener("click", () => sp.classList.add("shown"), { once: true });
          into.appendChild(sp);
        } else if (tag === "i" || tag === "em" || tag === "b" || tag === "strong") {
          const el = document.createElement(tag === "b" || tag === "strong" ? "strong" : "em");
          walk(n, el);
          into.appendChild(el);
        } else walk(n, into);
      }
    };
    const q = document.createElement("blockquote");
    walk(doc.body.firstChild, q);
    target.appendChild(q);
  }

  // Community rating: the Goodreads average if the export has it,
  // otherwise Open Library's readers (fetched on demand, then cached).
  const OL_KEY = "mylibrary.ol.v2";
  const THIN = 10;   // fewer ratings than this is flagged as not very reliable
  let olCache = {};
  try { olCache = JSON.parse(localStorage.getItem(OL_KEY) || "{}"); } catch { /* ignore */ }

  const normText = (s) => String(s).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Open Library often has several entries for one book; the first search hit
  // can be a near-empty duplicate. Ask a few ways and keep the best-rated match.
  async function olRating(book) {
    if (book.id in olCache) return olCache[book.id];
    const title = book.title.replace(/\s*\([^)]*#[\d.]+[^)]*\)\s*$/, "").split(/:\s/)[0];
    const last = book.author.split(/\s+/).pop();
    const ask = async (params, limit) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 9000);
      try {
        const res = await fetch(`https://openlibrary.org/search.json?${params}&fields=title,author_name,ratings_average,ratings_count&limit=${limit}`, { signal: ctl.signal });
        return (await res.json()).docs || [];
      } finally { clearTimeout(t); }
    };
    const matches = (d) => {
      const a = normText(title).slice(0, 20), b = normText(d.title || "");
      return (b.includes(a) || a.includes(b.slice(0, 20))) &&
        (d.author_name || []).some((n) => normText(n).includes(normText(last)));
    };
    let best = null;
    const consider = (d, trusted) => {
      if (!d || !d.ratings_count || !(trusted || matches(d))) return;
      if (!best || d.ratings_count > best.count) best = { avg: d.ratings_average, count: d.ratings_count };
    };
    try {
      const lookups = [
        ask(`title=${encodeURIComponent(title)}&author=${encodeURIComponent(book.author)}`, 1).then((r) => consider(r[0], true)),
        ask(`q=${encodeURIComponent(`${title} ${last}`)}`, 15).then((r) => r.forEach((d) => consider(d, false))),
      ];
      if (book.isbn) lookups.push(ask(`isbn=${encodeURIComponent(book.isbn)}`, 1).then((r) => consider(r[0], true)));
      const done = await Promise.allSettled(lookups);
      if (done.every((x) => x.status === "rejected")) return undefined;   // offline: try again later
    } catch { return undefined; }
    olCache[book.id] = best;
    try { localStorage.setItem(OL_KEY, JSON.stringify(olCache)); } catch { /* ignore */ }
    return best;
  }

  async function fillCommunity(book) {
    const box = v.community;
    if (book.avgRating) { box.replaceChildren(ratingLine(book.avgRating, "Goodreads average")); return; }
    box.replaceChildren(Object.assign(document.createElement("span"), { className: "rating-note", textContent: "Looking it up\u2026" }));
    const r = await olRating(book);
    if (books[viewer.idx] !== book) return; // moved on to another book
    if (r) {
      const n = `${r.count.toLocaleString()} rating${r.count === 1 ? "" : "s"} on Open Library`;
      const line = ratingLine(r.avg, r.count < THIN ? `only ${n}, so take it lightly` : n);
      box.replaceChildren(line);
      box.classList.toggle("thin", r.count < THIN);
    } else {
      box.classList.remove("thin");
      box.replaceChildren(Object.assign(document.createElement("span"), {
        className: "rating-note",
        textContent: r === undefined ? "Couldn't reach Open Library" : "No community ratings found yet",
      }));
    }
  }

  function buildCover(book, d) {
    const c = v.cover;
    c.className = `cover ${d.gilt ? "gilt" : "inked"}`;
    c.style.cssText =
      `--c:${d.color};` + (d.t ? `--t:${d.t};` : "") +
      `--grain:${d.tex};--grain-size:${d.texSize};--wear:${d.wear};--gold-a:${Math.max(0.85, d.goldA)};--orn:${d.orn};`;
    const clean = book.title.replace(/\s*\(([^)]*#[\d.]+[^)]*)\)\s*$/, "");
    const series = (book.title.match(/\(([^)]*#[\d.]+[^)]*)\)\s*$/) || [])[1];
    const [main, ...rest] = clean.split(/:\s/);
    const inner = document.createElement("div");
    inner.className = "cover-inner";
    const size = Math.max(19, Math.min(34, 40 - main.length * 0.55));
    inner.innerHTML = '<span class="cover-orn"></span><span class="cover-title"></span><span class="cover-sub"></span>' +
      '<span class="cover-rule"></span><span class="cover-author"></span><span class="cover-orn"></span>';
    const t = inner.querySelector(".cover-title");
    t.textContent = main;
    t.style.font = `${d.font.weight} ${size}px "${d.font.family}"`;
    inner.querySelector(".cover-sub").textContent = rest.join(": ") || series || "";
    inner.querySelector(".cover-author").textContent = book.author;
    c.replaceChildren(inner);
  }

  function fillPanel(idx) {
    const book = books[idx];
    v.pos.textContent = `${idx + 1} of ${books.length}`;
    v.title.textContent = book.title;
    v.author.textContent = book.author;
    v.mine.replaceChildren(book.rating
      ? ratingLine(book.rating)
      : Object.assign(document.createElement("span"), { className: "rating-note", textContent: "Not rated" }));
    const meta = [];
    if (book.dateRead) meta.push(`Read ${fmtDate(book.dateRead)}`);
    if (book.yearPublished) meta.push(`Published ${book.yearPublished < 0 ? `${-book.yearPublished} BC` : book.yearPublished}`);
    if (book.pages) meta.push(`${book.pages} pages`);
    v.meta.textContent = meta.join("  ·  ");
    renderReview(book.review, v.review);
    v.review.scrollTop = 0;
    if (/^\d+$/.test(book.id)) { v.link.href = `https://www.goodreads.com/book/show/${book.id}`; v.link.hidden = false; }
    else v.link.hidden = true;
    buildCover(book, currentDesigns[idx]);
    fillCommunity(book);
  }

  // Transform that maps the cover's resting box onto a rect (for FLIP).
  function coverTransform(rect, lift = 0) {
    const f = v.cover.getBoundingClientRect();
    return `translate(${rect.left - f.left}px, ${rect.top - f.top - lift}px) scale(${rect.width / f.width}, ${rect.height / f.height})`;
  }

  async function openViewer(idx) {
    if (viewer.busy || viewer.open) return;
    const src = shelfEl(idx);
    if (!src) return;
    viewer.busy = true;
    viewer.open = true;
    viewer.idx = idx;
    viewer.returnFocus = src;
    fillPanel(idx);
    v.root.hidden = false;
    document.body.classList.add("viewing");

    const from = src.getBoundingClientRect();
    src.classList.add("pulled");
    const dur = reduceMotion ? 1 : 800;
    const inner = v.cover.firstElementChild;
    const anims = [
      v.backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.6, fill: "both" }),
      v.cover.animate([
        { transform: coverTransform(from), offset: 0 },
        { transform: coverTransform(from, 16), offset: 0.22 },
        { transform: "none" },
      ], { duration: dur, easing: "cubic-bezier(.55,0,.2,1)", fill: "both" }),
      inner.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: dur, fill: "both" }),
      v.panel.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 0, offset: 0.45 }, { opacity: 1, transform: "none" }],
        { duration: dur * 1.15, easing: "ease-out", fill: "both" }),
      ...[v.close, v.prev, v.next].map((b) => b.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: dur, fill: "both" })),
    ];
    await Promise.all(anims.map((a) => a.finished));
    anims.forEach((a) => a.cancel());
    viewer.busy = false;
    v.close.focus({ preventScroll: true });
  }

  async function closeViewer(instant) {
    if (!viewer.open || (viewer.busy && !instant)) return;
    viewer.busy = true;
    const dest = shelfEl(viewer.idx);
    if (dest && !instant) {
      const r = dest.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) dest.scrollIntoView({ block: "center" });
    }
    if (!instant && !reduceMotion && dest) {
      const to = dest.getBoundingClientRect();
      const dur = 650;
      const anims = [
        v.cover.firstElementChild.animate([{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { duration: dur, fill: "both" }),
        v.cover.animate([
          { transform: "none" },
          { transform: coverTransform(to, 16), offset: 0.78 },
          { transform: coverTransform(to) },
        ], { duration: dur, easing: "cubic-bezier(.6,0,.3,1)", fill: "both" }),
        v.panel.animate([{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { duration: dur, fill: "both" }),
        v.backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, fill: "both" }),
        ...[v.close, v.prev, v.next].map((b) => b.animate([{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { duration: dur, fill: "both" })),
      ];
      await Promise.all(anims.map((a) => a.finished));
      v.root.hidden = true;
      anims.forEach((a) => a.cancel());
    } else {
      v.root.hidden = true;
    }
    els.wall.querySelectorAll(".book.pulled").forEach((b) => b.classList.remove("pulled"));
    document.body.classList.remove("viewing");
    viewer.open = false;
    viewer.busy = false;
    if (!instant && dest) dest.focus({ preventScroll: true });
  }

  async function stepViewer(delta) {
    if (!viewer.open || viewer.busy) return;
    viewer.busy = true;
    const n = books.length;
    const next = (viewer.idx + delta + n) % n;
    const dist = 60 * delta;
    const out = reduceMotion ? 1 : 260;
    await Promise.all([
      v.cover.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${-dist}px) rotate(${-2 * delta}deg)`, opacity: 0 }],
        { duration: out, easing: "ease-in", fill: "forwards" }).finished,
      v.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, fill: "forwards" }).finished,
    ]);
    shelfEl(viewer.idx)?.classList.remove("pulled");
    viewer.idx = next;
    shelfEl(next)?.classList.add("pulled");
    fillPanel(next);
    const inA = v.cover.animate([{ transform: `translateX(${dist}px) rotate(${2 * delta}deg)`, opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: out * 1.4, easing: "cubic-bezier(.2,.7,.3,1)" });
    const inB = v.panel.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: out * 1.6, easing: "ease-out" });
    v.cover.getAnimations().concat(v.panel.getAnimations()).forEach((a) => { if (a !== inA && a !== inB) a.cancel(); });
    await Promise.all([inA.finished, inB.finished]);
    viewer.busy = false;
  }

  els.wall.addEventListener("click", (e) => {
    const b = e.target.closest(".book");
    if (b) openViewer(Number(b.dataset.idx));
  });
  els.wall.addEventListener("keydown", (e) => {
    const b = e.target.closest(".book");
    if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openViewer(Number(b.dataset.idx)); }
  });
  v.close.addEventListener("click", () => closeViewer());
  v.backdrop.addEventListener("click", () => closeViewer());
  v.prev.addEventListener("click", () => stepViewer(-1));
  v.next.addEventListener("click", () => stepViewer(1));
  document.addEventListener("keydown", (e) => {
    if (!viewer.open) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") stepViewer(-1);
    else if (e.key === "ArrowRight") stepViewer(1);
    else if (e.key === "Tab") {   // keep focus inside the viewer
      const f = [...v.root.querySelectorAll("button, a[href]")].filter((x) => !x.hidden && x.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ============================================================
     Sharing
     The library published with the site is shared by its address.
     A library loaded from a file only lives in this browser, so it
     is compressed into the link itself (after the #, which is never
     sent to any server).
     ============================================================ */

  const FIELDS = ["id", "title", "author", "authorSort", "rating", "avgRating", "review",
                  "pages", "isbn", "yearPublished", "dateRead", "dateAdded"];
  const MAX_LINK = 60000;

  const b64url = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const unb64url = (s) => {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }

  async function encodeLibrary(list, withReviews) {
    const rows = list.map((b) => FIELDS.map((f) => (f === "review" && !withReviews ? "" : b[f] ?? null)));
    const raw = new TextEncoder().encode(JSON.stringify({ v: 1, f: FIELDS, r: rows }));
    return b64url(await pipe(raw, new CompressionStream("deflate-raw")));
  }
  async function decodeLibrary(code) {
    const raw = await pipe(unb64url(code), new DecompressionStream("deflate-raw"));
    const { f, r } = JSON.parse(new TextDecoder().decode(raw));
    return r.map((row) => Object.fromEntries(f.map((k, i) => [k, row[i]])));
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 4200);
  }

  /* ============================================================
     Whose library: the plaque on the bookcase
     ============================================================ */

  const OWNER_KEY = "mylibrary.owner";
  const SITE_OWNER = (document.querySelector('meta[name="library-owner"]')?.content || "").trim();
  let owner = "";
  let pendingOwner = "";   // typed into "New library", applied once a file is loaded

  const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const possessive = (n) => (/s$/i.test(n) ? `${n}’` : `${n}’s`);
  const libraryTitle = (n) => (n ? `${possessive(n)} Library` : "My Library");

  function setOwner(name, { persist = libSource === "upload" } = {}) {
    owner = cleanName(name);
    $("plaqueText").textContent = owner ? libraryTitle(owner) : "";
    $("plaque").hidden = !owner;
    document.title = libraryTitle(owner);
    if (persist) {
      try { owner ? localStorage.setItem(OWNER_KEY, owner) : localStorage.removeItem(OWNER_KEY); } catch { /* ignore */ }
    }
  }

  // Hash forms: #lib=CODE&owner=NAME   #sample&owner=NAME   #owner=NAME
  function hashParams() {
    return new URLSearchParams(location.hash.replace(/^#/, ""));
  }

  /* ---------- name dialog ---------- */

  const nd = {
    root: $("nameDialog"), form: $("nameForm"), title: $("ndTitle"),
    input: $("ownerInput"), preview: $("ownerPreview"), submit: $("ndSubmit"),
  };
  let ndMode = null, ndReturn = null, ndLink = null;

  function openNameDialog(mode) {
    ndMode = mode;
    ndReturn = document.activeElement;
    nd.title.textContent = mode === "share" ? "Share this library" : "Start a new library";
    nd.submit.textContent = mode === "share" ? "Copy link" : "Continue";
    nd.input.value = mode === "share" ? owner : "";
    nd.input.placeholder = "First name";
    updatePreview();
    nd.root.hidden = false;
    document.body.classList.add("viewing");
    nd.input.focus();
    nd.input.select();
    // Start packing the library into a link now, so copying is instant.
    ndLink = mode === "share" ? libraryCode().catch(() => null) : null;
  }
  function closeNameDialog() {
    nd.root.hidden = true;
    document.body.classList.remove("viewing");
    if (ndReturn && ndReturn.focus) ndReturn.focus();
  }
  function updatePreview() {
    const n = cleanName(nd.input.value);
    nd.preview.textContent = n ? `The plaque will read “${libraryTitle(n)}”` : "Leave it blank for no plaque.";
  }
  nd.input.addEventListener("input", updatePreview);
  nd.root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeNameDialog(); });
  nd.root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeNameDialog(); }
    if (e.key === "Tab") {   // keep focus in the dialog
      const f = [...nd.root.querySelectorAll("input, button")];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  nd.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = cleanName(nd.input.value);
    if (ndMode === "new") {
      pendingOwner = name;
      closeNameDialog();
      startNewLibrary();
      return;
    }
    setOwner(name);
    closeNameDialog();
    await shareNow(await ndLink);
  });

  /* ---------- sharing ---------- */

  // The packed library (only for libraries that live in this browser).
  async function libraryCode() {
    if (libSource !== "upload" && libSource !== "shared") return null;
    let code = await encodeLibrary(allBooks, true), note = "";
    if (code.length > MAX_LINK) {
      code = await encodeLibrary(allBooks, false);
      note = " Reviews were left out to keep the link a sensible length.";
    }
    return { code, note };
  }

  function buildLink(packed) {
    const base = location.origin + location.pathname;
    const p = new URLSearchParams();
    if (libSource === "sample") p.set("sample", "");
    if (packed) p.set("lib", packed.code);
    // the site's own library already knows its owner; only add a different name
    if (owner && !(libSource === "published" && owner === SITE_OWNER)) p.set("owner", owner);
    const h = p.toString().replace(/^sample=(&|$)/, "sample$1");
    return { url: h ? `${base}#${h}` : base, note: packed ? packed.note : "" };
  }

  async function shareNow(packed) {
    if ((libSource === "upload" || libSource === "shared") && !packed) {
      toast("Sorry — this browser can't build a share link.");
      return;
    }
    const link = buildLink(packed);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const tail = (link.note || "") + (local ? " (This is a local preview: the link works for others once the site is on GitHub Pages.)" : "");
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: libraryTitle(owner), url: link.url }); return; }
      catch (err) { if (err && err.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(link.url);
      toast(`Link to ${libraryTitle(owner)} copied.` + tail);
    } catch {
      window.prompt("Copy this link to share the library:", link.url);
    }
  }

  els.shareBtn.addEventListener("click", () => openNameDialog("share"));

  /* ---------- new library ---------- */

  // "New library" doesn't throw the current shelf away: it stays in memory
  // (and in this browser) until a new file has actually loaded, so
  // "Back to the bookshelf" can return to it.
  let previous = null;

  function startNewLibrary() {
    if (viewer.open) closeViewer(true);
    previous = allBooks.length ? { list: allBooks, source: libSource, owner } : null;
    $("welcomeTitle").textContent = pendingOwner ? `Bring ${possessive(pendingOwner)} books home` : "Bring your books home";
    $("backBtn").hidden = !previous;
    showError("");
    showWelcome();
    scrollTo({ top: 0 });
    ($("backBtn").hidden ? els.dropzone : $("backBtn")).focus({ preventScroll: true });
  }

  async function backToShelf() {
    if (!previous) return;
    const p = previous;
    previous = null;
    pendingOwner = "";
    libSource = p.source;
    setOwner(p.owner, { persist: false });
    await showLibrary(p.list);
  }

  $("backBtn").addEventListener("click", backToShelf);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.welcome.hidden && previous && nd.root.hidden) backToShelf();
  });

  /* ============================================================
     Compact header: once the full header scrolls away, it comes back
     pinned to the top as a slim bar (logo + icons only).
     ============================================================ */

  const slot = $("topbarSlot"), bar = $("topbar");
  const keepSlotHeight = () => { if (!bar.classList.contains("compact")) slot.style.minHeight = bar.offsetHeight + "px"; };
  new ResizeObserver(keepSlotHeight).observe(bar);
  new IntersectionObserver(([entry]) => {
    const gone = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
    if (gone === bar.classList.contains("compact")) return;
    if (gone) { keepSlotHeight(); closeSortMenu(false); }
    bar.classList.toggle("compact", gone);
    if (!gone) closeSortMenu(false);
  }).observe(slot);

  /* ============================================================
     Events
     ============================================================ */

  els.fileInput.addEventListener("change", (e) => readFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove("over"); }));
  els.dropzone.addEventListener("drop", (e) => readFile(e.dataTransfer.files[0]));
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  els.sampleBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("sample-library.csv");
      if (!res.ok) throw new Error();
      handleText(await res.text(), false);
    } catch {
      showError("The sample library couldn't be loaded. (Opening the page straight from disk blocks this — serve the folder or use GitHub Pages.)");
    }
  });

  els.resetBtn.addEventListener("click", () => openNameDialog("new"));

  // Re-shelve whenever the bookcase's width changes. Watching the element
  // itself (not just the window) also catches a page that first laid out
  // while hidden or zero-width, e.g. opened in a background tab.
  let resizeTimer, lastWallWidth = -1;
  new ResizeObserver(() => {
    const w = els.wall.clientWidth;
    if (w === lastWallWidth) return;      // height-only changes don't matter
    lastWallWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (viewer.open) closeViewer(true);
      layout(false);
    }, 120);
  }).observe(els.wall);

  /* ============================================================
     Start
     ============================================================ */

  async function findLibrary() {
    const hp = hashParams();
    const hashOwner = hp.get("owner");
    // 1. A library shared by link (#lib=…) or the sample (#sample)
    if (hp.get("lib")) {
      try {
        const list = await decodeLibrary(hp.get("lib"));
        libSource = "shared";
        setOwner(hashOwner || "");
        return list;
      } catch { showError("That shared link looks incomplete \u2014 it may have been cut off when it was copied."); }
    }
    if (hp.has("sample")) {
      try {
        const res = await fetch("sample-library.csv");
        if (res.ok) { libSource = "sample"; setOwner(hashOwner || ""); return booksFromCSV(await res.text()); }
      } catch { /* fall through */ }
    }
    // 2. What this visitor loaded last time
    const saved = load();
    if (saved && saved.length) {
      libSource = "upload";
      let n = ""; try { n = localStorage.getItem(OWNER_KEY) || ""; } catch { /* ignore */ }
      setOwner(n, { persist: false });
      return saved;
    }
    // 3. The library published with the site
    try {
      const res = await fetch("library.csv", { cache: "no-cache" });
      if (res.ok) { libSource = "published"; setOwner(hashOwner || SITE_OWNER, { persist: false }); return booksFromCSV(await res.text()); }
    } catch { /* no published library */ }
    return null;
  }

  (async function init() {
    try {
      const s = JSON.parse(localStorage.getItem(SORT_KEY) || "null");
      if (s && SORTS[s.by] && (s.dir === 1 || s.dir === -1)) sortState = s;
    } catch { /* ignore */ }
    // Work out what to show while the title is on screen.
    const ready = (async () => {
      const list = await findLibrary();
      if (list) await showLibrary(list, { light: false });
      return list;
    })();

    await playIntro(async () => {
      const list = await ready;
      if (list) lightUp();
      else els.welcome.hidden = false;
    });
  })();
})();
