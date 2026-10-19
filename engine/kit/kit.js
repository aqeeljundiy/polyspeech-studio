// Polyspeech kit: HTML builders for app screens (from origin/main) + deterministic animation helpers.
// Every builder returns an HTML string authored at app size (375pt wide). Ads compose them and drive
// everything from render(t), so frames are reproducible.
(function () {
  const K = {};
  // ---------- animation helpers ----------
  K.cl = x => Math.max(0, Math.min(1, x));
  K.lerp = (a, b, x) => a + (b - a) * x;
  K.E = {
    lin: x => x,
    out: x => 1 - Math.pow(1 - x, 3),
    app: x => { // the app's one curve, bezier(0.22,1,0.36,1), approximated
      return 1 - Math.pow(1 - x, 4.2); },
    outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
    inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
    inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
    back: x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
    spring: x => x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(9 * x),
  };
  K.p = (t, a, b, e = K.E.app) => e(K.cl((t - a) / (b - a)));
  K.bump = (t, a, d) => Math.sin(Math.PI * K.cl((t - a) / d));
  K.set = (el, o) => { if (el) for (const k in o) el.style[k] = o[k]; };
  // Hide/show without losing an element's own inline display (e.g. display:flex).
  K.show = (el, on) => {
    if (!el) return;
    if (on) { if (el.style.display === 'none') el.style.display = el.dataset.disp || ''; }
    else if (el.style.display !== 'none') { el.dataset.disp = el.style.display; el.style.display = 'none'; }
  };
  K.$ = (s, r = document) => r.querySelector(s);
  K.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  // enter like the app's FadeIn: opacity + rise 8pt
  K.fadeIn = (el, t, a, d = .24) => { const q = K.p(t, a, a + d); K.set(el, { opacity: q, transform: `translateY(${(1 - q) * 8}px)` }); return q; };

  // ---------- icons (Lucide, stroke 1.6 like the app) ----------
  K.ic = (name, size, color = 'currentColor', sw = 1.6, extra = '') =>
    `<span class="ic" style="width:${size}px;height:${size}px;color:${color};--sw:${sw}" ${extra}><i data-lucide="${name}"></i></span>`;
  K.icons = () => { if (window.lucide) lucide.createIcons({ icons: lucide.icons }); };
  // Web fonts load CJK glyphs in slices only when text is laid out. Lay out every string on the page
  // once, invisibly, in each weight, so hidden-at-load text renders on its first frame.
  K.preloadGlyphs = (extra = '') => {
    const txt = document.body.textContent.replace(/\s+/g, ' ') + extra;
    [400, 500, 600, 700, 800].forEach(w => {
      const d = document.createElement('div'); d.textContent = txt;
      d.style.cssText = `position:absolute;left:0;top:0;width:1000px;opacity:0;pointer-events:none;font-weight:${w};font-family:'Plus Jakarta Sans','Noto Sans SC','Noto Sans KR','Noto Sans JP','Segoe UI Emoji',sans-serif`;
      document.body.appendChild(d);
    });
  };


  // ---------- brand marks (simple-icons, CC0) and flags (emoji flags render as letters on Windows) ----------
  const BRAND = { apple: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701', googleplay: 'M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z' };
  K.brand = (n, size, color = '#fff') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block;flex:none"><path d="${BRAND[n]}" fill="${color}"/></svg>`;
  K.flag = (code, w = 20) => {
    const h = Math.round(w * 2 / 3), r = Math.max(2, w / 8);
    const inner = {
      zh: '<rect width="30" height="20" fill="#DE2910"/><path d="M5 2.2l1 3h3.1l-2.5 1.8 1 3L5 8.2 2.4 10l1-3L.9 5.2H4z" fill="#FFDE00"/><g fill="#FFDE00"><circle cx="10" cy="2" r=".9"/><circle cx="12" cy="4" r=".9"/><circle cx="12" cy="7" r=".9"/><circle cx="10" cy="9" r=".9"/></g>',
      ko: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#0047A0"/><path d="M10 10a5 5 0 0 1 10 0a2.5 2.5 0 0 1-5 0a2.5 2.5 0 0 0-5 0z" fill="#CD2E3A"/><g stroke="#000" stroke-width="1"><path d="M4 4.5l3-2M5 5.8l3-2M23 2.5l3 2M22 3.8l3 2M4 15.5l3 2M5 14.2l3 2M23 17.5l3-2M22 16.2l3-2"/></g>',
      ja: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>',
      es: '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>',
      fr: '<rect width="10" height="20" fill="#002395"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ED2939"/>',
    }[code] || '';
    return `<svg viewBox="0 0 30 20" width="${w}" height="${h}" style="display:block;flex:none;border-radius:${r}px;box-shadow:0 0 0 1px rgba(18,20,26,.08)">${inner}</svg>`;
  };

  // ---------- mascot (components/mascot/Mascot.js) ----------
  K.mascot = (mood = 'happy', { blink = false, mouth = 1 } = {}) => {
    const look = { happy: [0, 1], thinking: [3, -3], listening: [0, 0], encourage: [-1, 1] }[mood] || [0, 1];
    const eye = (cx, cy) => blink
      ? `<path d="M${cx - 9} ${cy + 1} Q${cx} ${cy + 6} ${cx + 9} ${cy + 1}" stroke="#111" stroke-width="3" stroke-linecap="round" fill="none"/>`
      : `<circle cx="${cx}" cy="${cy}" r="10.5" fill="#fff" stroke="#111" stroke-width="2.4"/><path d="M${cx - 9.5} ${cy - 4} Q${cx} ${cy - 11} ${cx + 9.5} ${cy - 4}" fill="#C9CDD3"/><circle cx="${cx + look[0]}" cy="${cy + look[1]}" r="5.6" fill="#111"/><circle cx="${cx + look[0] - 2}" cy="${cy + look[1] - 2}" r="1.6" fill="#fff"/>`;
    const happyEye = (cx, cy) => `<path d="M${cx - 9} ${cy + 3} Q${cx} ${cy - 8} ${cx + 9} ${cy + 3}" stroke="#111" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
    const raised = mood === 'thinking' || mood === 'listening';
    const brows = `<g stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"><path d="${raised ? 'M27 29 Q35 23 43 27' : 'M27 31 Q35 26 43 30'}"/><path d="${mood === 'thinking' ? 'M60 25 Q68 20 76 25' : 'M60 30 Q68 26 76 31'}"/></g>`;
    let eyes = mood === 'celebrate' ? happyEye(35, 46) + happyEye(68, 46) : mood === 'encourage' ? eye(35, 46) + happyEye(68, 46) : eye(35, 46) + eye(68, 46);
    let m;
    if (mood === 'thinking') m = `<ellipse cx="56" cy="75" rx="5" ry="6" fill="#EE4F78" stroke="#111" stroke-width="2.4"/>`;
    else if (mood === 'listening') m = `<path d="M40 72 Q52 82 64 72" stroke="#111" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    else { const w = mood === 'celebrate', top = w ? 64 : 66, bot = w ? 92 : 88;
      m = `<g transform="translate(52 ${top}) scale(1 ${mouth}) translate(-52 ${-top})"><path d="M28 ${top} Q52 ${top - 6} 76 ${top} Q74 ${bot} 52 ${bot} Q30 ${bot} 28 ${top} Z" fill="#EE4F78" stroke="#111" stroke-width="2.6" stroke-linejoin="round"/><path d="M38 ${bot - 3} Q52 ${bot - 12} 66 ${bot - 3} Q52 ${bot + 1} 38 ${bot - 3} Z" fill="#F48DA3"/></g>`; }
    return `<svg viewBox="0 0 104 104" width="100%" height="100%"><path d="M30 22 C27 12 29 5 33 2 C40 6 47 11 52 14 Z" fill="#B5F000"/><circle cx="52" cy="58" r="45" fill="#9ED600"/><circle cx="55" cy="57" r="43" fill="#B5F000"/><g transform="translate(3 1)">${brows}${eyes}${m}</g></svg>`;
  };

  // ---------- frame ----------
  K.statusBar = () => `<div class="sb"><div class="t">9:41</div><div class="isl"></div><div class="sig"><b style="height:5px"></b><b style="height:7px"></b><b style="height:9px"></b><b style="height:11px"></b></div><div class="bat"><i></i></div></div>`;
  K.device = (id, inner) => `<div class="device f" id="${id}"><div class="screen"><div class="grad"></div>${inner}${K.statusBar()}</div></div>`;

  // ---------- tab bar (TabBarV2) ----------
  K.tabBar = (active = 'home') => {
    const item = (key, label, icon) => {
      const on = key === active;
      return `<div class="col" style="flex:1;align-items:center;padding-top:9px;height:62px"><div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;${on ? 'background:#EAF1FE;border:1px solid #D6E2FD' : ''}">${K.ic(icon, 21, on ? '#2563EB' : '#9A9EA8', 1.8)}</div><div style="font-size:11px;line-height:14px;margin-top:4px;font-weight:${on ? 600 : 500};color:${on ? '#2563EB' : '#9A9EA8'}">${label}</div></div>`;
    };
    return `<div style="position:absolute;left:0;right:0;bottom:0;height:84px;background:#fff;border-top:1px solid #ECE8E1;display:flex;padding:0 8px 22px;z-index:15">
      ${item('home', 'Home', 'house')}${item('learn', 'Learn', 'book-open')}
      <div class="col" style="flex:1;align-items:center;padding-top:9px"><div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center"><div style="width:28px;height:28px">${K.mascot('listening')}</div></div><div style="font-size:11px;line-height:14px;margin-top:4px;font-weight:500;color:#9A9EA8">Chat</div></div>
      ${item('library', 'Library', 'bookmark')}
      <div class="col" style="flex:1;align-items:center;padding-top:9px"><div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center"><div style="width:28px;height:28px;border-radius:50%;background:#12141A;display:flex;align-items:center;justify-content:center">${K.ic('menu', 16, '#fff', 2)}</div></div><div style="font-size:11px;line-height:14px;margin-top:4px;font-weight:500;color:#12141A">More</div></div></div>`;
  };

  // ---------- Home (HomeScreenV2) ----------
  K.home = ({ lang = 'zh', langName = 'Mandarin', date = 'Tuesday, 20 October', greet = 'Good morning, Maya!', eyebrow = 'UP NEXT', heroTitle = 'Menu words', heroSub = '🍜 Order dinner in Shanghai', streak = 3, week = 2, saved = 18, plans = [] } = {}) => {
    const tile = (icon, v, l) => `<div style="flex:1;padding:9px 10px;border-radius:14px;background:rgba(255,255,255,.72)"><div class="row" style="gap:5px">${K.ic(icon, 14, '#5C6170')}<span style="font-size:17px;line-height:22px;font-weight:700">${v}</span></div><div style="font-size:11px;line-height:14px;color:#5C6170;margin-top:1px">${l}</div></div>`;
    const plan = p => `<div style="flex:1;background:#fff;border-radius:20px;border:1px solid #ECE8E1;padding:14px;display:flex;flex-direction:column;gap:6px"><div style="font-size:22px;line-height:28px">${p.emoji}</div><div class="cardTitle" style="min-height:40px">${p.title}</div><div style="height:6px;border-radius:3px;background:#F3F1EC;margin-top:4px;overflow:hidden"><div class="pfill" style="height:100%;width:${p.done / p.total * 100}%;background:#B5F000;border-radius:3px"></div></div><div style="font-size:12px;line-height:16px;color:#5C6170">${p.done} of ${p.total} steps</div></div>`;
    return `<div class="scroll" style="display:flex;flex-direction:column;gap:28px;padding-bottom:100px">
      <div><div class="row" style="display:inline-flex;gap:6px;padding:6px 12px;border:1px solid #ECE8E1;border-radius:999px;background:#fff;margin-bottom:8px">${K.flag(lang, 20)}<span style="font-size:14px;line-height:20px;font-weight:600">${langName}</span>${K.ic('chevron-down', 16, '#5C6170')}</div>
        <div class="row hm-head" style="gap:12px"><div style="width:44px;height:44px">${K.mascot('happy')}</div><div><div style="font-size:12px;line-height:16px;font-weight:500;color:#5C6170">${date}</div><div class="title" style="margin-top:1px">${greet}</div></div></div></div>
      <div class="hm-hero" style="background:linear-gradient(135deg,#DCE7FF,#EAF1FE 55%,#F0F8DC);border-radius:28px;padding:18px 16px 16px;border:1px solid #D8E3FB;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;flex-direction:column;gap:4px"><div class="eyebrow" style="color:#2563EB">${eyebrow}</div><div style="font-size:21px;line-height:27px;font-weight:700;letter-spacing:-.5px">${heroTitle}</div>${heroSub ? `<div class="sub">${heroSub}</div>` : ''}
          ${eyebrow === 'READY WHEN YOU ARE'
            ? `<div class="row" style="gap:8px;margin-top:12px"><div class="btnP" style="padding:11px 20px;gap:6px">${K.ic('mic', 16, '#fff', 2)}Start a chat</div><div class="row" style="padding:11px 18px;gap:6px;border-radius:999px;background:rgba(255,255,255,.85);font-size:15px;font-weight:600">${K.ic('book-open', 16, '#12141A')}New lesson</div></div>`
            : `<div><div class="btnP hm-start" style="padding:11px 20px;margin-top:12px;gap:6px">Start ${K.ic('arrow-right', 16, '#fff', 2)}</div></div>`}</div>
        <div class="row" style="gap:8px">${tile('zap', streak, 'day streak')}${tile('book-open', week, 'this week')}${tile('bookmark', saved, 'words saved')}</div></div>
      <div class="hm-plans"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="section">Your plans</div><div class="row hm-newplan" style="gap:4px;font-size:14px;font-weight:600;color:#2563EB">${K.ic('plus', 15, '#2563EB', 2)}New plan</div></div>
        ${plans.length ? `<div class="row" style="gap:10px;align-items:stretch">${plans.map(plan).join('')}</div>`
          : `<div class="row" style="gap:12px;padding:14px;background:#fff;border-radius:20px;border:1px solid #ECE8E1"><div style="width:30px;height:30px;border-radius:50%;background:#D5E2FD;display:flex;align-items:center;justify-content:center">${K.ic('target', 20, '#2563EB')}</div><div style="flex:1"><div class="cardTitle">Start a plan</div><div style="font-size:12px;line-height:16px;color:#5C6170">Tell me what you want to be able to do. I'll plan the steps.</div></div>${K.ic('plus', 18, '#2563EB')}</div>`}</div>
    </div>`;
  };

  // ---------- NewGoalSheet ----------
  K.goalSheet = ({ typed = '', caret = false, busy = false } = {}) => {
    const tpl = [['🍜', 'Order food at a restaurant', 6], ['💬', 'Hold 5 minutes of small talk', 5], ['✈️', 'Get ready for a trip', 6], ['💼', 'Learn 50 work words', 5]];
    return `<div class="backdrop gs-bd"></div><div class="sheet gs-sheet"><div class="grab"></div>
      <div class="row" style="justify-content:space-between;padding:0 0 8px"><div class="headline">Set a goal</div><div class="xbtn">${K.ic('x', 18, '#5C6170')}</div></div>
      <div class="sub">Tap a goal to add it, or tap it again to take it off your list. Or tell me what you want to be able to do.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">${tpl.map(x => `<div style="padding:12px;border-radius:14px;border:1px solid #ECE8E1;display:flex;flex-direction:column;gap:4px"><div style="font-size:22px;line-height:26px">${x[0]}</div><div style="font-size:14px;line-height:19px;font-weight:600">${x[1]}</div><div style="font-size:12px;color:#9A9EA8">${x[2]} steps</div></div>`).join('')}</div>
      <div class="eyebrow" style="margin-bottom:6px">OR WRITE YOUR OWN</div>
      <div class="gs-input" style="border-radius:14px;border:1px solid ${typed ? '#2563EB' : '#ECE8E1'};padding:11px 14px;font-size:15px;line-height:20px;color:${typed ? '#12141A' : '#9A9EA8'};box-shadow:${typed ? '0 0 0 4px rgba(37,99,235,.12)' : 'none'}">${typed || 'e.g. Chat with my partner\'s parents'}${caret ? '<span style="display:inline-block;width:2px;height:18px;background:#2563EB;vertical-align:middle;margin-left:1px"></span>' : ''}</div>
      <div style="border-radius:14px;border:1px solid #ECE8E1;padding:11px 14px;font-size:15px;color:#9A9EA8;margin-top:8px">Finish by (optional, YYYY-MM-DD)</div>
      <div class="btnP gs-plan" style="width:100%;padding:13px 0;margin-top:12px;opacity:${typed ? 1 : .4}">${busy ? '<span class="spin" style="width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;display:inline-block"></span>' : K.ic('zap', 16, '#fff', 2)}Plan it for me</div></div>`;
  };
  K.goalReview = ({ goal, tasks }) => `<div class="backdrop"></div><div class="sheet"><div class="grab"></div>
    <div class="row" style="justify-content:space-between;padding:0 0 8px"><div class="headline">Your plan</div><div class="xbtn">${K.ic('x', 18, '#5C6170')}</div></div>
    <div class="row" style="gap:12px;margin:6px 0 10px"><div style="font-size:28px">🎯</div><div class="headline">${goal}</div></div>
    ${tasks.map(x => `<div class="row gr-task" style="gap:12px;border-top:1px solid #ECE8E1;padding:10px 0">${K.ic(x.kind === 'chat' ? 'message-circle' : 'book-open', 16, '#2563EB')}<div style="flex:1;font-size:15px;line-height:20px">${x.title}</div>${K.ic('x', 16, '#9A9EA8')}</div>`).join('')}
    <div class="row" style="gap:8px;margin-top:10px"><div style="padding:13px 18px;font-size:15px;font-weight:600;color:#5C6170">Back</div><div class="btnP gr-add" style="flex:1;padding:13px 0">Add goal</div></div></div>`;

  // ---------- lesson runner ----------
  K.lessonHeader = ({ title, progress = [], idx = 1, total = 3, mute = true } = {}) => {
    const seg = s => `<div style="flex:1;height:6px;border-radius:3px;background:${{ cur: '#2563EB', nail: '#B5F000', close: '#B45309', try: '#DC2626', none: '#ECE8E1' }[s]}"></div>`;
    return `<div class="row" style="gap:4px;margin-bottom:8px"><div style="width:36px;height:36px;border-radius:50%;background:#F3F1EC;display:flex;align-items:center;justify-content:center;margin-right:4px">${K.ic('arrow-left', 20, '#12141A')}</div>
      <div class="headline" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
      <div style="width:36px;height:36px;border-radius:50%;background:#EAF1FE;display:flex;align-items:center;justify-content:center">${K.ic('volume-2', 20, '#2563EB')}</div>
      <div style="font-size:14px;font-weight:500;color:#5C6170;padding:0 6px">Start over</div><div style="font-size:14px;font-weight:500;color:#DC2626;padding:0 4px">End</div></div>
      <div class="row lh-prog" style="gap:12px;margin-bottom:12px;padding:0 4px"><div class="row" style="flex:1;gap:4px">${progress.map(seg).join('')}</div><div style="font-size:12px;line-height:16px;font-weight:600;color:#5C6170;min-width:44px;text-align:right">${idx} of ${total}</div></div>`;
  };
  K.answerSwitch = (sel = 'Speak') => {
    const b = (icon, l) => `<div class="row" style="gap:6px;padding:6px 12px;border-radius:999px;${l === sel ? 'background:#2563EB;color:#fff' : 'color:#5C6170'};font-size:14px;line-height:20px;font-weight:600">${K.ic(icon, 16, 'currentColor')}${l}</div>`;
    return `<div style="display:flex;justify-content:center;margin:4px 0"><div class="row" style="background:#F3F1EC;border-radius:999px;padding:4px;gap:4px">${b('mic', 'Speak')}${b('keyboard', 'Type')}${b('headphones', 'Just listen')}</div></div>`;
  };
  K.tutorTurn = (inner, { mood = 'happy', active = false, cls = '', mascotId = '' } = {}) =>
    `<div class="tturn ${cls}"><div class="av" ${mascotId ? `id="${mascotId}"` : ''}>${K.mascot(mood)}</div><div class="tbub ${active ? 'active' : ''}">${inner}</div></div>`;
  K.wordRow = (words, sm = false) => `<div class="wrow">${words.map(w => w.p ? `<span style="font-size:${sm ? 18 : 24}px;line-height:30px;color:#5C6170">${w.p}</span>` : `<div class="wbtn ${sm ? 'sm' : ''}"><div class="w">${w.w}</div><div class="r">${w.r}</div></div>`).join('')}</div>`;
  K.karaoke = (text, id) => `<div class="kar" id="${id}">${[...text].map(c => `<span>${c}</span>`).join('')}</div>`;
  K.lessonItem = ({ kind = 'PHRASE', teach, words, english, karaokeId, saved = false }) =>
    `<div class="kchip lime">${kind}</div>
     <div class="row" style="align-items:flex-start;gap:6px"><div style="flex:1;font-size:16px;line-height:22px">${teach}</div>${K.ic('speech', 18, '#9A9EA8')}</div>
     <div class="row" style="gap:6px;margin-top:4px;margin-bottom:6px">${K.ic('repeat', 14, '#2563EB')}<span class="lab12" style="color:#2563EB">REPEAT AFTER ME</span></div>
     <div class="li-target">${karaokeId ? K.karaoke(words.map(w => w.w || w.p).join(''), karaokeId) : ''}<div class="li-words" ${karaokeId ? 'style="display:none"' : ''}>${K.wordRow(words)}</div></div>
     <div class="body" style="margin-top:4px">${english}</div>
     <div class="tool">${'<div class="pa acc">' + K.ic('volume-2', 18, '#2563EB') + 'Listen</div>'}<div class="pa mut li-save" style="${saved ? 'background:#B5F000;color:#4D7C0F' : ''}">${K.ic('bookmark', 18, saved ? '#4D7C0F' : '#12141A')}${saved ? 'Saved' : 'Save'}</div><div style="flex:1"></div>${K.ic('flag', 18, '#9A9EA8')}</div>`;
  K.userAttempt = ({ text, verdict = '', id = '' }) =>
    `<div class="lwrap" ${id ? `id="${id}"` : ''} style="margin-bottom:14px"><div class="lbub" style="font-size:17px;line-height:24px;font-weight:500;padding:12px 16px 16px;border-radius:20px 20px 6px 20px">${text}${verdict ? `<div class="stamp ${verdict}">${K.ic(verdict === 'got' ? 'circle-check' : verdict === 'close' ? 'circle-check-big' : 'refresh-cw', 15, 'currentColor')}${verdict === 'got' ? 'Got it!' : verdict === 'close' ? 'Close' : 'Try again'}</div>` : ''}</div></div>`;

  // ---------- word sheet (WordSheet.js) ----------
  K.wordSheet = ({ word, reading, tones = [], meaning, breakdown = [], literal = '', usage, example }) => `<div class="backdrop ws-bd"></div><div class="sheet ws-sheet" style="padding-bottom:34px"><div class="grab"></div>
    <div class="row" style="justify-content:flex-end;padding-bottom:4px"><div class="xbtn">${K.ic('x', 18, '#5C6170')}</div></div>
    <div class="col" style="gap:12px">
      <div class="row" style="justify-content:space-between"><div><div style="font-size:40px;line-height:48px;font-weight:700">${word}</div><div class="body" style="color:#2563EB;margin-top:2px">${reading}</div></div><div style="padding:10px;border-radius:50%;background:#EAF1FE">${K.ic('volume-2', 24, '#2563EB')}</div></div>
      ${tones.length ? `<div class="col" style="gap:4px"><div class="lab12" style="color:#9A9EA8">Tones</div><div class="row" style="gap:8px;flex-wrap:wrap">${tones.map(x => `<div style="border-radius:12px;border:1px solid #ECE8E1;padding:8px 12px;text-align:center"><div style="font-size:18px;line-height:24px;font-weight:700">${x.s}</div><div style="font-size:12px;color:#5C6170">${x.t}</div></div>`).join('')}</div><div class="row" style="gap:6px;font-size:14px;font-weight:600;color:#2563EB;margin-top:4px">${K.ic('volume-1', 18, '#2563EB')}Hear it slowly</div></div>` : ''}
      <div class="col" style="gap:4px"><div class="lab12" style="color:#9A9EA8">Meaning</div><div style="font-size:16px;line-height:24px;font-weight:600">${meaning}</div></div>
      ${breakdown.length ? `<div class="col" style="gap:4px"><div class="lab12" style="color:#9A9EA8">Breakdown</div><div class="row" style="gap:6px">${breakdown.map((b, i) => (i ? '<span style="color:#9A9EA8">+</span>' : '') + `<div style="min-width:64px;padding:6px 10px;border-radius:12px;border:1px solid #ECE8E1;text-align:center"><div style="font-size:20px;line-height:26px;font-weight:700">${b.part}</div><div style="font-size:12px;color:#2563EB">${b.r}</div><div style="font-size:12px;color:#5C6170">${b.e}</div></div>`).join('')}</div>${literal ? `<div class="sub" style="margin-top:4px">Literally "${literal}"</div>` : ''}</div>` : ''}
      <div class="col" style="gap:4px"><div class="lab12" style="color:#9A9EA8">When to use it</div><div class="body">${usage}</div></div>
      <div class="row" style="background:#F3F1EC;border-radius:14px;padding:12px;justify-content:space-between"><div><div style="font-size:18px;line-height:24px;font-weight:700">${example.t}</div><div class="sub" style="color:#2563EB">${example.r}</div><div class="sub">${example.e}</div></div>${K.ic('volume-2', 18, '#2563EB')}</div>
      <div class="row" style="gap:8px"><div class="row" style="flex:1;justify-content:center;gap:6px;padding:12px 0;border-radius:999px;background:#EAF1FE;color:#2563EB;font-size:16px;font-weight:600">${K.ic('mic', 18, '#2563EB')}Say it</div><div class="row ws-save" style="flex:1;justify-content:center;gap:6px;padding:12px 0;border-radius:999px;background:#2563EB;color:#fff;font-size:16px;font-weight:600">${K.ic('bookmark', 18, '#fff')}<span>Save</span></div></div>
    </div></div>`;

  // ---------- mic dock (MicDock.js) ----------
  K.micDock = ({ step = '', hint = '', menu = true, id = 'dock' } = {}) => `<div class="dock" id="${id}">${menu ? '<div class="handle"></div>' : ''}${step ? `<div class="step">${step}</div>` : ''}<div class="hint">${hint}</div>
    <div class="ctr"><div class="q">${K.ic('circle-help', 24, '#fff')}</div><div class="micw"><div class="ring"></div><div class="mic">${K.ic('mic', 36, '#12141A', 1.8)}</div></div>${menu ? `<div class="menu">${K.ic('settings', 24, '#fff')}Menu</div>` : '<div></div>'}</div></div>`;
  // drive mic state each frame: state = idle | disabled | rec
  K.dockState = (dock, t, state, hint, stepLabel) => {
    if (!dock) return;
    const mic = K.$('.mic', dock), ring = K.$('.ring', dock), ic = K.$('.mic .ic', dock);
    if (hint !== undefined) { const h = K.$('.hint', dock); if (h.textContent !== hint) h.textContent = hint; }
    if (stepLabel !== undefined) { const s = K.$('.step', dock); if (s && s.textContent !== stepLabel) s.textContent = stepLabel; }
    if (state === 'rec') {
      const q = ((t % 1.4) / 1.4);
      K.set(mic, { background: '#EF4444', opacity: 1 }); K.set(ring, { background: '#EF4444', transform: `scale(${1 + q * .45})`, opacity: q < .5 ? .7 - q * 1.1 : Math.max(0, .15 - (q - .5) * .3) });
      if (ic) { ic.style.color = '#fff'; }
    } else {
      const b = (Math.sin(t * Math.PI / 1.1) + 1) / 2;
      K.set(mic, { background: '#C6F24E', opacity: state === 'disabled' ? .5 : 1 }); K.set(ring, { background: '#C6F24E', transform: `scale(${1.05 + b * .13})`, opacity: .25 + b * .25 });
      if (ic) ic.style.color = '#12141A';
    }
  };

  // ---------- conversation pieces ----------
  K.tgt = (text, selIdx = []) => `<div class="tgt cjk">${[...text].map((c, i) => selIdx.includes(i) ? `<span class="sel">${c}</span>` : c).join('')}</div>`;
  K.charTurn = ({ text, tr, en, vocab = [], mood = 'happy', cls = '', who = '' }) => K.tutorTurn(
    `<div class="playbtn">${K.ic('volume-2', 18, '#2563EB')}</div>${who ? `<div style="font-size:12px;font-weight:600;color:#9A9EA8;margin-bottom:2px">${who}</div>` : ''}<div style="padding-right:32px">${K.tgt(text)}</div><div class="sub" style="margin-top:-2px">${tr}</div><div class="body" style="color:#5C6170;margin-top:2px">${en}</div>${vocab.length ? `<div class="vchips">${vocab.map(v => `<div class="vchip">${K.ic('plus', 14, '#5C6170')}${v}</div>`).join('')}</div>` : ''}`, { mood, cls });
  K.learner = ({ text, tr = '', en = '', id = '', footer = '', fix = null }) => `<div class="lwrap" ${id ? `id="${id}"` : ''}><div class="lbub">
    <div class="lb-text"><div class="tgt cjk" style="color:#fff">${text}</div>${tr ? `<div class="sub tr" style="margin-top:-2px">${tr}</div>` : ''}${en ? `<div class="body en" style="margin-top:2px">${en}</div>` : ''}</div>
    <div class="lb-dots" style="display:none;padding:6px 0"><span class="dots"><i style="background:#fff"></i><i style="background:#fff"></i><i style="background:#fff"></i></span></div>
    ${footer ? `<div class="ffoot">
      <div class="ff-pend row" style="gap:10px"><span class="dots"><i style="background:#fff"></i><i style="background:#fff"></i><i style="background:#fff"></i></span><span class="sub" style="color:rgba(255,255,255,.88)">Evaluating your response...</span></div>
      <div class="ff-tog" style="display:none">${footer === 'ok' ? `<div class="tog ok">${K.ic('circle-check', 16, '#12141A')}Nice, nothing to fix${K.ic('chevron-down', 18, '#12141A')}</div>` : `<div class="tog fix">${K.ic('pencil', 16, '#B45309')}See correction${K.ic('chevron-down', 18, '#B45309')}</div>`}</div>
      ${fix ? `<div class="fcard ff-card" style="display:none">${(fix.errors || []).map(e => `<div class="err"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="t cjk">${e.text}</span><span class="ichip">${e.issue}</span></div><div class="sub" style="margin-top:4px">${e.why}</div><div class="sub" style="color:#2563EB;font-weight:600;margin-top:4px">→ ${e.sug}</div></div>`).join('')}<div class="cway"><div class="h">CORRECT WAY${K.ic('volume-2', 16, '#4D7C0F')}</div><div class="tgt cjk">${fix.text}</div><div class="sub" style="margin-top:-2px">${fix.tr}</div><div class="body" style="color:#5C6170">${fix.en}</div><div class="savebtn ff-save"><span class="sv-a" style="display:flex">${K.ic('bookmark', 16, '#12141A')}</span><span class="sv-b" style="display:none">${K.ic('circle-check', 16, '#15803D')}</span><span class="sv-t">Save correction</span></div></div></div>` : ''}
    </div>` : ''}</div></div>`;
  // footer phases: 'text' | 'pend' | 'tog' | 'card' | 'saved'
  K.learnerPhase = (el, phase) => {
    if (!el) return;
    const show = (s, on) => K.show(K.$(s, el), on);
    show('.lb-dots', phase === 'dots'); show('.lb-text', phase !== 'dots');
    show('.ffoot', !['dots', 'text'].includes(phase)); show('.ff-pend', phase === 'pend');
    show('.ff-tog', ['tog', 'card', 'saved'].includes(phase)); show('.ff-card', ['card', 'saved'].includes(phase));
    const sv = K.$('.ff-save', el);
    if (sv) { const s = phase === 'saved'; const sp = K.$('.sv-t', sv); if (sp.textContent !== (s ? 'Saved' : 'Save correction')) { sp.textContent = s ? 'Saved' : 'Save correction'; sv.style.color = s ? '#15803D' : '#12141A'; K.$('.sv-a', sv).style.display = s ? 'none' : 'flex'; K.$('.sv-b', sv).style.display = s ? 'flex' : 'none'; } }
  };
  K.dotsAnim = (root, t) => K.$$('.dots i', root).forEach((d, i) => { const q = ((t * 1000 - i * 140) % 940 + 940) % 940; const u = q < 260 ? q / 260 : q < 520 ? 1 - (q - 260) / 260 : 0; d.style.transform = `translateY(${-3 * u}px)`; d.style.opacity = .35 + .65 * u; });

  K.roleplayHeader = ({ title, ex = 1, total = 3, who = 'Barista', auto = false }) => `<div class="row" style="gap:8px"><div style="width:36px;height:36px;border-radius:50%;background:#F3F1EC;display:flex;align-items:center;justify-content:center">${K.ic('arrow-left', 20, '#12141A')}</div><div><div class="headline">${title}</div><div class="sub rp-status">Exchange ${ex} of ${total} — talking to ${who}</div></div></div>
    <div class="row" style="justify-content:space-between;margin-top:8px"><div class="sub">Auto-reply (show expected answer)</div><div style="width:46px;height:28px;border-radius:14px;background:${auto ? '#2563EB' : '#D8DCE3'};position:relative"><div style="position:absolute;top:3px;${auto ? 'right:3px' : 'left:3px'};width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)"></div></div></div>`;
  K.helpModal = ({ id = 'help', result = null }) => `<div class="layer" id="${id}" style="z-index:40"><div class="backdrop" style="background:rgba(11,18,32,.24)"></div><div class="modal" style="box-shadow:0 30px 70px -20px rgba(11,18,32,.35)">
    <div style="position:absolute;right:14px;top:14px">${K.ic('x', 20, '#4A4A4A')}</div>
    <div class="row" style="gap:12px;margin-bottom:16px;align-items:flex-start"><div style="width:40px;height:40px;border-radius:50%;background:#EAF1FE;display:flex;align-items:center;justify-content:center;flex:none">${K.ic('message-circle-question', 22, '#2563EB')}</div><div><div style="font-size:16px;font-weight:800">Need help replying?</div><div style="font-size:12px;line-height:16px;color:#5C6170">Say your reply in English. I'll transcribe it, then turn it into a natural response.</div></div></div>
    <div class="row hm-rec" style="padding:16px;border-radius:14px;border:1px solid #ECE8E1;background:#EAF1FE;margin-bottom:16px;gap:10px"><div style="flex:1"><div style="font-size:14px;font-weight:700">Speak in English</div><div class="hm-hint" style="font-size:12px;line-height:16px;color:#5C6170">Record your response in English then tap stop.</div></div><div class="btnP hm-btn" style="min-width:104px;padding:10px 16px;font-weight:700;font-size:14px">${K.ic('mic', 16, '#fff')}<span>Record</span></div></div>
    <div class="hm-status" style="font-size:14px;color:#5C6170;margin-bottom:16px">Record your idea in English and I'll help you say it naturally.</div>
    ${result ? `<div class="hm-result" style="border-radius:14px;border:1px solid #ECE8E1;overflow:hidden"><div style="padding:16px;position:relative"><div style="position:absolute;right:8px;top:8px">${K.ic('volume-2', 18, '#2563EB')}</div><div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#2563EB">SUGGESTED REPLY</div>${K.tgt(result.text)}<div style="font-size:14px;color:#5C6170;margin-top:6px">${result.tr}</div><div style="margin-top:10px;font-size:14px"><b>Translation:</b> ${result.en}</div></div><div style="padding:16px;background:#EAF1FE"><div class="btnP" style="width:100%;padding:10px 0;font-size:14px">${K.ic('mic', 16, '#fff')}Reply</div></div></div>` : ''}
  </div></div>`;
  K.expected = ({ text, tr, en }) => `<div style="background:#EAF1FE;border-radius:14px;padding:12px;margin-bottom:8px"><div class="caption" style="margin-bottom:4px">Expected response:</div><div class="row" style="justify-content:space-between"><div class="cjk" style="font-size:14px;font-weight:600">${text}</div>${K.ic('volume-2', 20, '#2563EB')}</div><div class="sub">${tr}</div><div class="sub">${en}</div></div>`;
  K.scenarioComplete = ({ title, goal }) => `<div class="scroll"><div class="largeTitle" style="margin:8px 0 60px">Scenario Complete!</div><div class="col" style="align-items:center;gap:12px;text-align:center"><div class="sc-emoji" style="font-size:56px;line-height:64px">🎉</div><div class="title">${title}</div><div class="sub" style="padding:0 24px">Goal achieved: ${goal}</div><div class="row" style="gap:12px;margin-top:16px"><div class="btnP" style="padding:10px 20px;font-size:14px">Practice Again</div><div style="padding:10px 20px;border-radius:999px;border:1px solid #ECE8E1;font-size:14px;font-weight:600;color:#2563EB">Choose Another</div></div></div></div>`;
  K.xpToast = (lines, id = 'xp') => `<div id="${id}" style="position:absolute;left:50%;top:136px;transform:translateX(-50%);background:#059669;border-radius:20px;padding:10px 20px;min-width:120px;text-align:center;color:#fff;z-index:60;box-shadow:var(--dock)">${lines.map((l, i) => `<div style="font-size:${i ? 13 : 16}px;font-weight:${i ? 600 : 800};white-space:nowrap">${l}</div>`).join('')}</div>`;
  K.streakBadge = (n, id = '') => `<div ${id ? `id="${id}"` : ''} class="row" style="display:inline-flex;background:#FFF7ED;border-radius:12px;padding:4px 8px;gap:4px">${K.ic('flame', 16, '#EA580C')}<span class="sk-n" style="font-size:13px;font-weight:800;color:#EA580C">${n} ${n === 1 ? 'day' : 'days'}</span></div>`;
  K.reviewDeck = ({ idx, total, front, tr, back, ex }) => `<div class="layer" style="background:#F8FAFC"><div style="position:absolute;top:62px;left:0;right:0;text-align:center"><div style="font-size:16px;font-weight:700;color:#0A0A0A">${idx} / ${total}</div><div style="font-size:14px;font-weight:600;color:#6B7280">All Cards</div></div><div style="position:absolute;left:16px;top:62px">${K.ic('x', 24, '#0A0A0A')}</div>
    <div class="rv-wrap" style="position:absolute;inset:0;perspective:1000px"><div class="rv-card" style="position:absolute;inset:0;transform-style:preserve-3d">
      <div class="rcard" style="background:#fff;border:1px solid #E5E8EE"><div class="cjk" style="font-size:32px;font-weight:700;color:#0A0A0A">${front}</div><div style="font-size:18px;color:#6B7280;margin-top:8px">${tr}</div><div style="position:absolute;bottom:20px;font-size:13px;color:#9CA3AF">Tap to reveal translation</div></div>
      <div class="rcard" style="background:#F0F4FF;border:2px solid #2563EB;transform:rotateY(180deg)"><div class="cjk" style="font-size:32px;font-weight:700;color:#0A0A0A">${front}</div><div style="font-size:18px;color:#6B7280;margin-top:8px">${tr}</div><div style="width:60px;height:2px;background:#2563EB;margin:20px 0"></div><div style="font-size:22px;font-weight:600;color:#2563EB">${back}</div><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#2563EB;margin-top:22px">EXAMPLE</div><div class="cjk" style="font-size:17px;font-weight:600;color:#0A0A0A;margin-top:6px">${ex.t}</div><div style="font-size:14px;font-style:italic;color:#6B7280">${ex.r}</div><div style="font-size:14px;color:#4A4A4A">${ex.e}</div><div style="position:absolute;bottom:20px;font-size:13px;color:#9CA3AF">Swipe for next card</div></div>
    </div></div>
    <div style="position:absolute;left:24px;right:24px;top:640px;height:4px;border-radius:2px;background:#E5E7EB"><div style="width:${idx / total * 100}%;height:100%;background:#2563EB;border-radius:2px"></div></div>
    <div class="row" style="position:absolute;left:0;right:0;top:670px;justify-content:center;gap:32px">${K.ic('arrow-left', 28, '#2563EB')}${K.ic('volume-2', 22, '#2563EB')}${K.ic('arrow-right', 28, '#2563EB')}</div></div>`;

  // ---------- tap indicator: positioned in stage space at an element's on-screen center ----------
  K.tapAt = (tapEl, ringEl, target, t, a, opts = {}) => {
    // a = press time; dot arrives .45s before, lifts .5s after
    const arrive = opts.arrive ?? .45, hold = opts.hold ?? .5;
    if (!target || t < a - arrive - .05 || t > a + hold + .3) { K.show(tapEl, false); K.show(ringEl, false); return; }
    const r = target.getBoundingClientRect(), x = r.left + r.width / 2 + (opts.dx || 0), y = r.top + r.height / 2 + (opts.dy || 0);
    const qIn = K.p(t, a - arrive, a - .05, K.E.out), qOut = K.p(t, a + hold, a + hold + .25);
    const press = K.bump(t, a - .05, .2);
    K.show(tapEl, true);
    K.set(tapEl, { left: x + (1 - qIn) * 140 + 'px', top: y + (1 - qIn) * 220 + 'px', opacity: qIn * (1 - qOut), transform: `scale(${(1 - press * .22) * (1 + qOut * .2)})` });
    const rq = K.p(t, a, a + .5, K.E.out);
    K.show(ringEl, t > a && t < a + .5);
    K.set(ringEl, { left: x + 'px', top: y + 'px', opacity: (1 - rq) * .9, transform: `scale(${1 + rq * 1.3})` });
  };

  // ---------- captions (word-by-word blur up) ----------
  K.caption = (wrap, c) => {
    const d = document.createElement('div'); d.className = 'cap'; Object.assign(d.style, c.style || {});
    const tmp = document.createElement('div'); tmp.innerHTML = c.html;
    [...tmp.childNodes].forEach(n => { const hl = n.nodeType !== 3;
      n.textContent.split(/\s+/).filter(Boolean).forEach(w => { if (w === '|') { d.appendChild(document.createElement('br')); return; }
        const s = document.createElement('span'); s.className = hl ? 'w hl' : 'w'; s.textContent = w; d.appendChild(s); }); });
    wrap.appendChild(d); c.el = d; c.words = [...d.querySelectorAll('.w')]; return c;
  };
  K.captionRender = (c, t) => {
    const on = t > c.a - .05 && t < c.b + .25; K.show(c.el, on); if (!on) return;
    const out = K.p(t, c.b, c.b + .2, K.E.inExpo), st = c.stagger ?? .06;
    c.words.forEach((w, i) => { const q = K.p(t, c.a + i * st, c.a + .4 + i * st, K.E.outExpo);
      K.set(w, { transform: `translateY(${(1 - q) * 60 - out * 40}px)`, filter: `blur(${(1 - q) * 12 + out * 10}px)`, opacity: q * (1 - out) }); });
  };

  window.K = K;
})();
