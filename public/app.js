
let token = localStorage.getItem('tk777_token') || '';
let me = null, categories = [], games = [];
let crashTimer = null;
let crashGameId = null;
let crashPollBusy = false;
let crashPhase = 'countdown';
let crashHistoryData = [];
let crashVisualFrame = null;
let crashVisualValue = 1;
let crashVisualSegment = null;
let crashVisualUpdatedAt = 0;
let crashVisualStartMs = null;

let crashSlots = [
  { roundId:null,busy:false,status:'ready',auto:false,autoBet:false,autoTarget:2,lastAutoSessionId:null },
  { roundId:null,busy:false,status:'ready',auto:false,autoBet:false,autoTarget:2,lastAutoSessionId:null }
];

const $ = s => document.querySelector(s);

const api = async (path, body = null) => {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type':'application/json',
      ...(token ? {Authorization:'Bearer '+token} : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const raw = await r.text();
  let d;

  try {
    d = JSON.parse(raw);
  } catch {
    throw Error(`API Error: HTTP ${r.status}; JSON response পাওয়া যায়নি`);
  }

  if (!r.ok) throw Error(d.error || 'সমস্যা হয়েছে');
  return d;
};

const money = n =>
  'BDT ' + Number(n || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function stopCrashMonitor() {
  if (crashVisualFrame !== null) cancelAnimationFrame(crashVisualFrame);
  crashVisualFrame = null;
  crashVisualSegment = null;
  crashVisualValue = 1;
  crashVisualUpdatedAt = 0;
  crashVisualStartMs = null;
  if (crashTimer) clearInterval(crashTimer);
  crashTimer = null;
  crashGameId = null;
  crashPollBusy = false;
  crashPhase = 'countdown';
}

function shell(content) {
  $('#app').innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">TK777<small>PLAY • ENJOY</small></div>
        <div class="top-actions">
          <span class="pill">${me ? money(me.balance) : 'Guest'}</span>
          <button onclick="showAuth()">${me ? 'Account' : 'Login'}</button>
        </div>
      </header>

      ${content}

      <nav class="bottom">
        <button onclick="home()"><b>⌂</b>Home</button>
        <button onclick="page('promotion')"><b>🎁</b>Promotion</button>
        <button onclick="page('invite')"><b>♧</b>Invite</button>
        <button onclick="page('reward')"><b>★</b>Reward</button>
        <button onclick="page('member')"><b>♙</b>Member</button>
      </nav>
    </div>`;
}

function toast(t) {
  let e = document.createElement('div');
  e.className = 'toast';
  e.textContent = t;
  $('#app').prepend(e);
  setTimeout(() => e.remove(), 3000);
}

async function init() {
  try {
    if (token) me = (await api('/me')).user;
  } catch {
    token = '';
    localStorage.removeItem('tk777_token');
  }

  try {
    categories = (await api('/categories')).categories;
    games = (await api('/games')).games;
  } catch (e) {
    toast(e.message);
  }

  home();
}

/* HOME */

function home() {
  stopCrashMonitor();

  shell(`
    <div class="hero">
      <div class="hero-copy">
        <span class="hero-tag">WELCOME TO</span>
        <h2>TK777</h2>
        <p>PLAY • EXPLORE • ENJOY</p>
        <small>Free-play arcade experience</small>
      </div>
      <div class="hero-mark">777</div>
    </div>

    <div class="quick">
      <button onclick="page('member')"><b>◉</b><span>Balance</span></button>
      <button onclick="page('history')"><b>▤</b><span>History</span></button>
      <button onclick="page('promotion')"><b>🎁</b><span>Rewards</span></button>
      <button onclick="page('member')"><b>♙</b><span>Account</span></button>
    </div>

    <div class="section">
      <div class="section-head">
        <span>GAME CATEGORIES</span>
        <small>ALL CATEGORIES ›</small>
      </div>
      <div class="cats">
        ${categories.map((c,i) => `
          <button class="cat" onclick="filterGames('${esc(c.id)}')">
            ${c.image_url
              ? `<img src="${esc(c.image_url)}" alt="" onerror="this.style.display='none'">`
              : `<span>${['🔥','♥','🎰','♛','⚽','🏆','♠','🐟','🎟','🎯','👑','🎁'][i%12]}</span>`}
            <b>${esc(c.name)}</b>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <span>🔥 HOT GAMES</span>
        <small>${games.length} GAMES</small>
      </div>
      <div class="games">${games.map(gameCard).join('')}</div>
    </div>

    <div class="section">
      <div class="notice">
        TK777 একটি ফ্রি-প্লে গেমিং ডেমো। সব ক্রেডিটের আর্থিক মূল্য শূন্য;
        বাস্তব টাকা জমা বা উত্তোলন করা যায় না।
      </div>
    </div>
  `);
}

function favoriteIds() {
  try {
    return JSON.parse(localStorage.getItem('tk777_favorites') || '[]');
  } catch {
    return [];
  }
}

function toggleFavorite(id, el) {
  let ids = favoriteIds();
  ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids,id];
  localStorage.setItem('tk777_favorites',JSON.stringify(ids));
  if (el) el.textContent = ids.includes(id) ? '♥' : '♡';
}

function gameCard(g) {
  return `
    <button class="game" onclick="openGame('${esc(g.id)}')">
      <span class="favorite-toggle"
        onclick="event.stopPropagation();toggleFavorite('${esc(g.id)}',this)">
        ${favoriteIds().includes(g.id) ? '♥' : '♡'}
      </span>
      ${g.image_url
        ? `<img src="${esc(g.image_url)}" alt="" onerror="this.style.display='none'">`
        : `<div class="placeholder">${g.game_type === 'aviator' ? '✈️' : g.game_type === 'superace' ? '🂡' : '🎮'}</div>`}
      <strong>${esc(g.name)}</strong>
      <small>${g.game_type === 'aviator' ? 'CRASH GAME' : g.game_type === 'superace' ? 'CARD GAME' : 'ARCADE GAME'}</small>
    </button>`;
}

function filterGames(id) {
  const c = categories.find(x => x.id === id);
  const list = id === 'favorites'
    ? games.filter(g => favoriteIds().includes(g.id))
    : games.filter(g => g.category_id === id);

  stopCrashMonitor();

  shell(`
    <div class="page">
      <div class="section-head">
        <span>${esc(c?.name || 'Games')}</span>
        <small>${list.length} GAMES</small>
      </div>
      <div class="games">
        ${list.map(gameCard).join('') || '<p class="muted">এই ক্যাটাগরিতে এখনো গেম যোগ করা হয়নি।</p>'}
      </div>
      <button class="secondary" onclick="home()">ফিরে যান</button>
    </div>
  `);
}

/* LOGIN AND REGISTER */

function showAuth() {
  stopCrashMonitor();

  shell(`
    <div class="page">
      <div class="card auth-card">
        <h2>Welcome to TK777</h2>
        <div class="tabs">
          <button id="loginTab" class="active" onclick="authMode('login')">Login</button>
          <button id="registerTab" onclick="authMode('register')">Create Account</button>
        </div>

        <form id="authform">
          <div id="usernameWrap" class="hidden">
            <label>Username</label>
            <input class="field" name="username" placeholder="আপনার নাম">
          </div>
          <label>Email</label>
          <input class="field" name="email" type="email" required placeholder="Email address">
          <label>Password</label>
          <input class="field" name="password" type="password" minlength="8" required placeholder="কমপক্ষে ৮ অক্ষর">
          <button class="primary" id="authSubmit">Login</button>
        </form>

        <p class="muted">নতুন অ্যাকাউন্টের প্রাথমিক ব্যালেন্স: <b>০ ক্রেডিট</b></p>
      </div>
    </div>
  `);

  authMode('login');
}

let mode = 'login';

function authMode(m) {
  mode = m;
  const f = $('#authform');
  if (!f) return;

  $('#usernameWrap').classList.toggle('hidden',m !== 'register');
  $('#loginTab').classList.toggle('active',m === 'login');
  $('#registerTab').classList.toggle('active',m === 'register');
  $('#authSubmit').textContent = m === 'register' ? 'Create Account' : 'Login';

  f.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));

    try {
      const r = await api('/'+mode,data);
      token = r.token;
      localStorage.setItem('tk777_token',token);
      me = r.user;
      home();
    } catch (err) {
      toast(err.message);
    }
  };
}

/* MEMBER AND PAGES */

function page(name) {
  stopCrashMonitor();

  if (name === 'member') {
    if (!me) return showAuth();

    shell(`
      <div class="page">
        <div class="card profile-card">
          <h2>Member Center</h2>
          <div class="avatar">${esc((me.username || 'U').slice(0,1).toUpperCase())}</div>
          <h3>${esc(me.username)}</h3>
          <p>${esc(me.email)}</p>
          <div class="balance-panel">
            <small>AVAILABLE BALANCE</small>
            <strong>${money(me.balance)}</strong>
          </div>
          <button class="secondary" onclick="page('history')">Transaction History</button>
          <button class="danger" onclick="logout()">Logout</button>
        </div>
      </div>
    `);

  } else if (name === 'history') {
    historyPage();

  } else {
    shell(`
      <div class="page">
        <div class="card">
          <h3>${name === 'reward' ? 'Reward Center' : name === 'invite' ? 'Invite Friends' : 'Promotion'}</h3>
          <p>
            ${name === 'invite'
              ? 'এই ডেমোতে রেফারেল বোনাস চালু নেই।'
              : 'এই ফ্রি-প্লে ডেমোতে বাস্তব অর্থের ডিপোজিট বা উত্তোলন নেই।'}
          </p>
        </div>
      </div>
    `);
  }
}

async function historyPage() {
  if (!me) return showAuth();

  try {
    const d = await api('/history');

    shell(`
      <div class="page">
        <h3>Transaction History</h3>
        <div class="card">
          ${d.transactions.map(t => `
            <div class="history-row">
              <span>
                ${esc(t.note)}
                <small>${esc(t.created_at)}</small>
              </span>
              <b class="${t.amount >= 0 ? 'gold' : 'loss'}">
                ${t.amount > 0 ? '+' : ''}${t.amount}
                <small>ক্রেডিট</small>
                <small>Balance ${money(t.balance_after)}</small>
              </b>
            </div>
          `).join('') || 'কোনো লেনদেন নেই'}
        </div>

        <h3>Game History</h3>
        <div class="card">
          ${d.rounds.map(r => `
            <div class="history-row">
              <span>
                ${esc(r.game_id)}
                <small>Bet ${r.bet_amount} · ${r.multiplier}x</small>
              </span>
              <b>${r.payout} <small>পেআউট</small></b>
            </div>
          `).join('') || 'কোনো গেম খেলা হয়নি'}
        </div>
      </div>
    `);
  } catch (e) {
    toast(e.message);
  }
}

function logout() {
  api('/logout',{}).catch(() => {});
  token = '';
  me = null;
  localStorage.removeItem('tk777_token');
  home();
}

/* GAME ROUTING */

function openGame(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;

  if (!me) {
    showAuth();
    toast('গেম খেলতে Login করুন');
    return;
  }

  if (g.game_type === 'html') {
    if (!g.html_content) {
      toast('এই গেমে HTML ফাইল যোগ করা হয়নি');
      return;
    }

    stopCrashMonitor();

    shell(`
      <div class="page">
        <h3>${esc(g.name)}</h3>
        <div class="card game-frame">
          <iframe id="customGame" title="Custom game" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
        </div>
        <button class="secondary" onclick="home()">ফিরে যান</button>
      </div>
    `);

    $('#customGame').srcdoc = g.html_content;
    return;
  }

  if (g.game_type === 'aviator') aviator(g);
  else if (g.game_type === 'superace') superAce(g);
}

/* ==========================================
   TK777 FLIGHT GAME SCREEN
========================================== */

function aviator(g) {
  stopCrashMonitor();

  crashSlots = [
    {roundId:null,busy:false,status:'ready',auto:false,autoBet:false,autoTarget:2,lastAutoSessionId:null},
    {roundId:null,busy:false,status:'ready',auto:false,autoBet:false,autoTarget:2,lastAutoSessionId:null}
  ];
  crashGameId = g.id;
  crashPhase = 'countdown';

  $('#app').innerHTML = `
    <main class="aviator-app">
      <header class="aviator-header">
        <button class="aviator-back" onclick="home()" aria-label="Back">‹</button>
        <div class="aviator-wordmark">Aviator<span>TK777</span></div>
        <button class="aviator-menu" type="button" onclick="toast(&quot;Game menu&quot;)" aria-label="Game menu">☰</button>
        <div class="aviator-wallet"><small>VIRTUAL BALANCE</small><b id="gameBalance">${money(me.balance)}</b></div>
      </header>

      <div class="aviator-ticker">
        <span class="ticker-label">LAST</span>
        <div id="crashHistoryTicker" class="ticker-values"><i>Loading results…</i></div>
      </div>

      <section class="aviator-game-body">
        <div class="aviator-stage countdown" id="aviatorStage">
          <div class="aviator-rays"></div>
          <div class="aviator-sky"></div>
          <div class="aviator-stars"></div>
          <div class="aviator-clouds cloud-back"></div>
          <div class="aviator-clouds cloud-middle"></div>
          <div class="aviator-clouds cloud-front"></div>
          <div class="stage-flash" id="stageFlash"></div>

          <div class="aviator-funbar">FUN MODE</div>
          <div class="aviator-promo" id="aviatorPromo">
            <div class="promo-partners"><b>UFC</b><i></i><strong>Aviator</strong></div>
            <div class="promo-official">OFFICIAL PARTNERS</div>
            <div class="promo-progress"><span></span></div>
            <div class="promo-spribe">
              <b>✺ SPRIBE</b>
              <span>Official Game <em>✓</em></span>
              <small>Since 2019</small>
            </div>
            <div class="promo-plane">✈</div>
          </div>

          <div class="multiplier" id="multi">1.00x</div>
          <div class="crash-status" id="crashStatus">WAITING FOR NEXT ROUND</div>

          <svg class="flight-chart" id="flightChart" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="flightLine" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="#ff304c"/>
                <stop offset="100%" stop-color="#ff304c"/>
              </linearGradient>
              <linearGradient id="flightFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#b30b32" stop-opacity=".78"/>
                <stop offset="100%" stop-color="#ed1741" stop-opacity=".58"/>
              </linearGradient>
              <filter id="flightGlow">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <path id="flightArea" class="flight-area" d="M35 405 L35 440 L35 440 Z"/>
            <path id="flightPath" class="flight-path" d="M35 405"/>
            <circle id="flightDot" class="flight-dot" cx="35" cy="405" r="6"/>
          </svg>

          <div class="plane-trail" id="planeTrail"></div>
          <div class="plane-wrap" id="planeWrap">
            <svg class="plane user-plane" id="plane" viewBox="110 95 340 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="User-designed red aircraft"><path d="M357,187 L349,179 L312,193 L311,195 L350,203 L357,190Z M371,168 L369,169 L366,178 L364,178 L361,174 L358,174 L358,177 L364,184 L358,200 L362,198 L367,191 L372,194 L374,193 L369,185Z M403,168 L410,184 L414,182 L423,170 L422,168 L412,166 L404,166Z M405,170 L407,168 L417,168 L420,170 L408,175Z M409,194 L398,166 L389,158 L369,160 L337,169 L328,169 L318,164 L310,163 L298,167 L278,178 L271,184 L270,192 L296,195 L301,191 L344,171 L375,162 L384,162 L388,167 L401,199 L397,200 L392,198 L359,215 L344,219 L336,216 L333,213 L335,209 L329,206 L218,188 L206,188 L196,192 L192,197 L205,210 L214,206 L216,210 L213,213 L190,224 L187,228 L186,235 L212,223 L215,223 L218,228 L210,233 L211,235 L238,223 L241,224 L239,227 L183,253 L173,250 L147,230 L138,228 L122,236 L123,239 L133,234 L136,235 L126,242 L118,245 L116,251 L119,252 L130,248 L155,273 L158,273 L159,271 L139,249 L140,246 L144,245 L163,257 L174,259 L174,262 L166,265 L165,268 L169,269 L231,244 L235,244 L240,249 L246,250 L296,233 L318,223 L334,224 L329,228 L227,262 L181,274 L156,276 L149,280 L153,284 L159,284 L160,287 L164,289 L183,282 L322,243 L357,231 L381,221 L403,209 L409,201Z M216,192 L220,191 L275,201 L308,205 L329,209 L330,211 L325,216 L321,217 L226,196Z M310,173 L308,176 L291,184 L282,184 L280,182 L287,176 L298,171 L306,171Z M308,167 L314,166 L328,173 L314,181 L311,181 L310,179 L317,175 L317,172 L309,169Z M381,99 L378,106 L388,138 L402,164 L412,164 L413,161 L403,130Z M382,103 L400,128 L400,133 L385,115 L381,108Z" fill="#f02036" fill-rule="evenodd" stroke="#f02036" stroke-linejoin="round" stroke-width="1"/><g class="user-plane-propeller"><path d="M419,180 L412,187 L418,214 L437,249 L441,250 L442,240 L435,212Z M422,216 L426,219 L440,241 L439,246 L422,220Z" fill="#f02036" stroke="#f02036" stroke-linejoin="round"/></g></svg>
            <div class="plane-fire"></div>
          </div>
          <div class="aviator-stage-note">TK777 • VIRTUAL COIN GAME</div>
        </div>

        <div class="aviator-bet-panels">
          ${[0,1].map(i => `
            <section class="aviator-bet-card">
              <div class="bet-mode-tabs">
                <button id="betMode${i}" class="mode-tab active" onclick="setAviatorMode(${i},'bet')">Bet</button>
                <button id="autoMode${i}" class="mode-tab" onclick="setAviatorMode(${i},'auto')">Auto</button>
              </div>
              <div class="bet-card-main">
                <div class="bet-amount-side">
                  <div class="bet-amount-wrap">
                    <button type="button" onclick="adjustQuickBet(${i},-1)" aria-label="Decrease bet">−</button>
                    <input id="crashBet${i}" type="number" min="1" max="1000000" step="1" value="10" aria-label="Bet amount">
                    <button type="button" onclick="adjustQuickBet(${i},1)" aria-label="Increase bet">+</button>
                  </div>
                  <div class="quick-bets">
                    ${[1,2,5,10].map(v => `<button type="button" onclick="setQuickBet(${i},${v})">${v}</button>`).join('')}
                  </div>
                </div>
                <div class="bet-action-side">
                  <button class="aviator-bet-button" id="startCrash${i}" onclick="startCrash(${i})">Bet<br><b>BDT 10.00</b></button>
                  <button class="aviator-cashout-button" id="cashoutBtn${i}" disabled onclick="cashout(${i})">Cash Out<br><b>BDT 0.00</b></button>
                  <button class="aviator-cancel-button" id="cancelAuto${i}" onclick="cancelAuto(${i})" disabled>Cancel</button>
                </div>
              </div>
              <div class="aviator-auto-row" id="autoOptions${i}">
                <label><input type="checkbox" id="autoBetToggle${i}" onchange="toggleAutoBet(${i},this.checked)"> Auto Bet</label>
                <label><input type="checkbox" id="autoToggle${i}" onchange="toggleAuto(${i},this.checked)"> Auto Cash Out</label>
                <label class="auto-cash-label">Auto Cash Out
                  <input type="number" id="autoTarget${i}" min="1.01" max="1000" step=".01" value="2.00"><span>x</span>
                </label>
              </div>
              <div class="aviator-slot-status"><span id="slotStatus${i}">READY</span><small id="result${i}">Waiting for next round</small></div>
            </section>
          `).join('')}
        </div>

        <div class="aviator-footer-note">TK777 • BDT DISPLAY ONLY • NO CASH VALUE</div>
      </section>
    </main>
  `;

  startCrashMonitor(g.id);
}

function setQuickBet(index, amount) {
  const input = $('#crashBet'+index);
  if (!input) return;
  input.value = String(amount);
  input.dispatchEvent(new Event('change', {bubbles:true}));
  const btn = $('#startCrash'+index);
  if (btn) btn.innerHTML = 'Bet<br><b>BDT '+Number(amount).toFixed(2)+'</b>';
}

function adjustQuickBet(index, direction) {
  const input = $('#crashBet'+index);
  if (!input) return;
  const current = Math.max(1,Number(input.value)||1);
  const next = Math.max(1,Math.min(1000000,current + direction));
  input.value = String(next);
  const btn = $('#startCrash'+index);
  if (btn) btn.innerHTML = 'Bet<br><b>BDT '+next.toFixed(2)+'</b>';
}

function setAviatorMode(index, mode) {
  const bet = $('#betMode'+index);
  const auto = $('#autoMode'+index);
  const options = $('#autoOptions'+index);
  if (bet) bet.classList.toggle('active',mode==='bet');
  if (auto) auto.classList.toggle('active',mode==='auto');
  if (options) options.classList.toggle('auto-mode-active',mode==='auto');
}

/* ==========================================
   CRASH ROUND MONITOR
========================================== */

function startCrashMonitor(gameId) {
  stopCrashMonitor();
  crashGameId = gameId;

  pollCrashState();

  crashTimer = setInterval(() => {
    pollCrashState();
  },400);
}

function updateCrashHistory(previous) {
  crashHistoryData = Array.isArray(previous) ? previous.slice() : [];
  const ticker = $('#crashHistoryTicker');
  if (!previous || !previous.length) {
    if (ticker) ticker.innerHTML = '<i>No previous rounds yet</i>';
    return;
  }

  const chips = previous.map(x => {
    const n = Number(x.crash_multiplier);
    const cls = n >= 2 ? 'history-high' : 'history-low';
    return {n,cls};
  });
  if (ticker) ticker.innerHTML = chips.slice(0,12).map(x =>
    `<span class="${x.cls}">${x.n.toFixed(2)}x</span>`
  ).join('');
}

function setAviatorFeed(mode) {
  ['all','previous','top'].forEach(key => {
    const button = $('#feed'+key.charAt(0).toUpperCase()+key.slice(1));
    if (button) button.classList.toggle('active',key===mode);
  });
  const summary = $('.feed-summary');
  const history = $('#crashHistory');
  if (!summary || !history) return;
  if (mode === 'previous') {
    summary.innerHTML = '<b>Previous rounds</b><span>সম্পন্ন রাউন্ডের ফলাফল</span>';
    history.innerHTML = crashHistoryData.length ? crashHistoryData.map(x => {
      const n = Number(x.crash_multiplier);
      return '<span class="'+(n >= 2 ? 'history-high' : 'history-low')+'">'+n.toFixed(2)+'x</span>';
    }).join('') : '<span class="muted">আগের কোনো রাউন্ড নেই</span>';
  } else if (mode === 'top') {
    summary.innerHTML = '<b>Top</b><span>সার্ভারের Top তালিকা অনুপস্থিত</span>';
    history.innerHTML = '<span class="muted">Top Players তালিকা দেখানোর API এখনো নেই</span>';
  } else {
    summary.innerHTML = '<b>All Bets</b><span>লাইভ বেট তালিকা</span>';
    history.innerHTML = '<span class="muted">All Bets লাইভ তালিকার জন্য সার্ভার API প্রয়োজন</span>';
  }
}

function updateSlotStatus(i,text) {
  const el = $('#slotStatus'+i);
  if (el) el.textContent = text;
}

function updateSlotButtons(i) {
  const slot = crashSlots[i];
  const start = $('#startCrash'+i);
  const cash = $('#cashoutBtn'+i);
  const cancel = $('#cancelAuto'+i);
  const autoToggle = $('#autoToggle'+i);
  const autoBetToggle = $('#autoBetToggle'+i);
  const targetInput = $('#autoTarget'+i);

  if (!start || !cash) return;

  if (autoToggle) autoToggle.checked = !!slot.auto;
  if (autoBetToggle) autoBetToggle.checked = !!slot.autoBet;

  if (targetInput && document.activeElement !== targetInput) {
    targetInput.value = Number(slot.autoTarget || 2).toFixed(2);
  }

  if (cancel) cancel.disabled = !slot.auto;

  start.disabled =
    !!slot.roundId ||
    slot.busy ||
    crashPhase !== 'countdown';

  cash.disabled =
    !slot.roundId ||
    slot.busy ||
    slot.status !== 'active' ||
    crashPhase !== 'active';
}

function updateAllSlotButtons() {
  for (let i=0;i<crashSlots.length;i++) {
    updateSlotButtons(i);
  }
}

async function pollCrashState() {
  if (crashPollBusy || !crashGameId) return;
  if (!$('#aviatorStage')) return;

  crashPollBusy = true;

  try {
    const state = await api('/crash/state',{
      gameId:crashGameId
    });

    if (!$('#aviatorStage')) return;

    const multiplier = Number(state.multiplier || 1);
    const multi = $('#multi');
    const status = $('#crashStatus');
    const stage = $('#aviatorStage');

    crashPhase = state.status;

    if (state.status === 'countdown') {
      const seconds = Math.max(0,Number(state.countdownMs || 0)/1000);

      stage.classList.remove('running','crashed');
      stage.classList.add('countdown');

      stopCrashVisualAnimation();
      crashVisualValue = 1;
      crashVisualStartMs = null;
      const resetPlane = $('#planeWrap');
      const resetGraph = $('#flightChart');
      if (resetPlane) {
        resetPlane.classList.remove('plane-hover','plane-approach','plane-crashed');
        resetPlane.style.left = '10%';
        resetPlane.style.top = '70%';
      }
      if (resetGraph) resetGraph.classList.remove('graph-crashed');
      if (multi) multi.textContent = '1.00x';

      updateFlightCurve(1);

      if (status) {
        status.textContent = `STARTING IN ${Math.ceil(seconds)}s`;
      }

      crashSlots.forEach((slot,i) => {
        if (slot.autoBet && !slot.roundId && !slot.busy && slot.lastAutoSessionId !== state.sessionId) {
          slot.lastAutoSessionId = state.sessionId;
          startCrash(i);
        }
        if (!slot.roundId && !slot.busy && slot.status !== 'ready') {
          slot.status = 'ready';
          updateSlotStatus(i,'READY');

          const result = $('#result'+i);
          if (result) result.textContent = 'নতুন রাউন্ডে বেট করতে পারবেন';
        }
      });

    } else if (state.status === 'active') {
      stage.classList.remove('countdown','crashed');
      stage.classList.add('running');

      setCrashVisualTarget(multiplier,state.startMs);
      const flyingPlane = $('#planeWrap');
      if (flyingPlane) flyingPlane.classList.remove('plane-crashed');

      if (status) status.textContent = 'FLYING';

      for (let i=0;i<crashSlots.length;i++) {
        const slot = crashSlots[i];

        if (
          slot.roundId &&
          slot.status === 'active' &&
          slot.auto &&
          !slot.busy &&
          multiplier >= Number(slot.autoTarget || 2)
        ) {
          cashout(i);
        }
      }

    } else {
      stage.classList.remove('running','countdown');
      stage.classList.add('crashed');

      stopCrashVisualAnimation();
      crashVisualStartMs = null;
      crashVisualValue = multiplier;
      if (multi) multi.textContent = multiplier.toFixed(2)+'x';
      updateFlightCurve(multiplier);
      updateCashoutAmounts(multiplier);

      if (status) status.textContent = 'CRASHED AT '+multiplier.toFixed(2)+'x';

      const wrap = $('#planeWrap');
      if (wrap) {
        wrap.classList.remove('plane-hover','plane-approach');
        wrap.classList.add('plane-crashed');
      }
      const disappearingGraph = $('#flightChart');
      if (disappearingGraph) disappearingGraph.classList.add('graph-crashed');

      const flash = $('#stageFlash');
      if (flash) flash.classList.add('show');
    }

    updateCrashHistory(state.previous || []);
    updateAllSlotButtons();

    for (let i=0;i<crashSlots.length;i++) {
      const slot = crashSlots[i];

      if (!slot.roundId || slot.busy) continue;

      if (slot.status === 'active') {
        try {
          const t = await api('/crash/tick',{
            roundId:slot.roundId
          });

          if (t.balance !== undefined && me) {
            me.balance = t.balance;
            const bal = $('#gameBalance');
            if (bal) bal.textContent = money(me.balance);
          }

          if (t.betStatus !== 'active') {
            slot.status = t.betStatus;
            slot.roundId = null;

            updateSlotStatus(
              i,
              t.betStatus === 'cashed_out' ? 'CASHED OUT' : 'CRASHED'
            );

            const result = $('#result'+i);

            if (result) {
              result.textContent = t.betStatus === 'cashed_out'
                ? `Cash Out: ${t.multiplier}x · পেআউট ${t.payout} ক্রেডিট`
                : 'ক্র্যাশ হয়েছে · পেআউট ০';
            }

            updateSlotButtons(i);
          }
        } catch (e) {
          console.error('Crash bet status error',e);
        }
      }
    }

  } catch (e) {
    console.error('Crash state error',e);
    const status = $('#crashStatus');
    if (status) status.textContent = 'RECONNECTING...';
  } finally {
    crashPollBusy = false;
  }
}

/* Smoothly interpolate between authoritative server multiplier snapshots. */
function stopCrashVisualAnimation() {
  if (crashVisualFrame !== null) cancelAnimationFrame(crashVisualFrame);
  crashVisualFrame = null;
  crashVisualSegment = null;
}

function setCrashVisualTarget(target,startMs) {
  if (Number.isFinite(Number(startMs))) crashVisualStartMs = Number(startMs);
  if (crashVisualStartMs === null) {
    crashVisualStartMs = Date.now()-Math.log(Math.max(1,Number(target)||1))*12000;
  }
  if (crashVisualFrame === null) {
    crashVisualFrame = requestAnimationFrame(renderCrashVisual);
  }
}

function renderCrashVisual(now) {
  if (!$('#aviatorStage') || crashVisualStartMs === null) {
    crashVisualFrame = null;
    return;
  }

  // Match the server's exponential flight curve continuously between polls.
  const elapsed = Math.max(0,Date.now()-crashVisualStartMs);
  const value = Math.max(1,Math.exp(elapsed/12000));
  crashVisualValue = value;

  const multi = $('#multi');
  if (multi) multi.textContent = value.toFixed(2)+'x';
  updateFlightCurve(value);
  updateCashoutAmounts(value);

  crashVisualFrame = requestAnimationFrame(renderCrashVisual);
}

function updateCashoutAmounts(multiplier) {
  for (let i=0;i<crashSlots.length;i++) {
    const slot = crashSlots[i];
    const button = $('#cashoutBtn'+i);
    const input = $('#crashBet'+i);
    if (!button || !slot.roundId || slot.status !== 'active') continue;
    const bet = Math.max(0,Number(input?.value || slot.betAmount || 0));
    const payout = Math.round(bet*Math.round(multiplier*100)/100*100)/100;
    button.innerHTML = 'Cash Out<br><b>BDT '+payout.toFixed(2)+'</b>';
  }
}

/* ==========================================
   FLIGHT GRAPH AND PLANE MOVEMENT
========================================== */

function updateFlightCurve(multiplier) {
  const path = $('#flightPath');
  const area = $('#flightArea');
  const dot = $('#flightDot');
  const wrap = $('#planeWrap');
  const trail = $('#planeTrail');

  if (!path || !dot || !wrap) return;

  // The plane and the graph endpoint share the exact same coordinates.
  // The plane reaches its reference stopping point gradually, then both hold.
  const elapsed = crashPhase === 'active' && crashVisualStartMs !== null
    ? Math.max(0,Date.now()-crashVisualStartMs)
    : 0;
  const progress = crashPhase === 'active'
    ? Math.max(0,Math.min(1,elapsed/4500))
    : 0;
  const x = 35 + 530*progress;
  const y = 405 - 320*progress;
  const c1x = 35 + (x-35)*0.34;
  const c2x = 35 + (x-35)*0.72;
  const c2y = y + (405-y)*0.16;
  const curve = `M35 405 C${c1x} 405 ${c2x} ${c2y} ${x} ${y}`;

  path.setAttribute('d',curve);
  area.setAttribute('d',curve+` L${x} 440 L35 440 Z`);
  dot.setAttribute('cx',x);
  dot.setAttribute('cy',y);

  // Anchor the graph tip to the aircraft's actual nose/propeller point,
  // not to the center of the plane wrapper. This keeps the red line attached
  // even while the aircraft bobs up and down.
  const stage = wrap.closest('.aviator-stage');
  const planeSvg = wrap.querySelector('svg');
  if (stage && planeSvg) {
    const stageRect = stage.getBoundingClientRect();
    const planeRect = planeSvg.getBoundingClientRect();
    const tipX = (x/1000)*stageRect.width;
    const tipY = (y/440)*stageRect.height;
    const noseOffsetX = (438-280)/340*planeRect.width;
    const noseOffsetY = (215-195)/200*planeRect.height;
    const wrapperCenterX = tipX - noseOffsetX;
    const wrapperCenterY = tipY - noseOffsetY;
    wrap.style.left = (wrapperCenterX/stageRect.width*100)+'%';
    wrap.style.top = (wrapperCenterY/stageRect.height*100)+'%';
  }
  wrap.classList.remove('plane-hover','plane-approach');

  path.style.strokeDasharray = 'none';
  path.style.strokeDashoffset = '0';
  if (area) area.style.opacity = progress > 0 ? '.82' : '0';

  if (trail) {
    trail.style.left = (x/10)+'%';
    trail.style.top = (y/4.4)+'%';
    trail.style.opacity = progress > 0 ? '1' : '0';
  }

  const flash = $('#stageFlash');
  if (flash) flash.classList.remove('show');
}

/* ==========================================
   AUTO CASH OUT
========================================== */

function toggleAutoBet(index,enabled) {
  const slot = crashSlots[index];
  if (!slot) return;
  slot.autoBet = !!enabled;
  if (enabled) { slot.lastAutoSessionId = null; toast('Auto Bet চালু হয়েছে'); }
  else toast('Auto Bet বন্ধ করা হয়েছে');
  updateSlotButtons(index);
}

function toggleAuto(index,enabled) {
  const slot = crashSlots[index];
  const input = $('#autoTarget'+index);

  if (!slot) return;

  const target = Number(input?.value || 2);

  if (!Number.isFinite(target) || target < 1.01 || target > 1000) {
    toast('AUTO multiplier 1.01x থেকে 1000x এর মধ্যে দিন');

    const toggle = $('#autoToggle'+index);
    if (toggle) toggle.checked = false;

    slot.auto = false;
    return;
  }

  slot.autoTarget = target;
  slot.auto = !!enabled;

  updateSlotButtons(index);
}

function cancelAuto(index) {
  const slot = crashSlots[index];
  if (!slot) return;

  slot.auto = false;

  const toggle = $('#autoToggle'+index);
  if (toggle) toggle.checked = false;

  updateSlotButtons(index);
  toast('Auto Cash Out বাতিল করা হয়েছে');
}

/* ==========================================
   PLACE BET
========================================== */

async function startCrash(index) {
  const slot = crashSlots[index];

  if (!slot || slot.roundId || slot.busy) return;

  if (crashPhase !== 'countdown') {
    toast('শুধু কাউন্টডাউনের সময় বেট করা যাবে');
    updateSlotButtons(index);
    return;
  }

  const betInput = $('#crashBet'+index);
  const button = $('#startCrash'+index);
  const result = $('#result'+index);

  try {
    const bet = Number(betInput.value);

    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000) {
      throw Error('১ থেকে ১০,০০,০০০ এর মধ্যে পূর্ণসংখ্যার বেট দিন');
    }

    slot.busy = true;
    button.disabled = true;

    const targetInput = $('#autoTarget'+index);
    const target = Number(targetInput?.value || 2);

    if (!Number.isFinite(target) || target < 1.01 || target > 1000) {
      throw Error('AUTO multiplier 1.01x থেকে 1000x এর মধ্যে দিন');
    }

    slot.autoTarget = target;

    const r = await api('/crash/start',{
      gameId:crashGameId,
      betAmount:bet
    });

    slot.roundId = r.roundId;
    slot.betAmount = bet;
    slot.status = 'active';
    me.balance = r.balance;

    const bal = $('#gameBalance');
    if (bal) bal.textContent = money(me.balance);

    updateSlotStatus(index,'BET ACTIVE');

    if (result) {
      result.textContent = 'বেট সফল! প্লেন উড়লে Cash Out করতে পারবেন।';
    }

  } catch (e) {
    toast(e.message);
    if (result) result.textContent = e.message;
  } finally {
    slot.busy = false;
    updateSlotButtons(index);
  }
}

/* ==========================================
   CASH OUT
========================================== */

async function cashout(index) {
  const slot = crashSlots[index];

  if (!slot || !slot.roundId || slot.busy) return;

  if (crashPhase !== 'active') {
    toast('প্লেন ওড়া শুরু হলে Cash Out করতে পারবেন');
    return;
  }

  const roundId = slot.roundId;

  slot.busy = true;
  updateSlotButtons(index);

  try {
    const r = await api('/crash/cashout',{
      roundId
    });

    if (r.balance !== undefined) {
      me.balance = r.balance;

      const bal = $('#gameBalance');
      if (bal) bal.textContent = money(me.balance);
    }

    const betAmount = Number(slot.betAmount || $('#crashBet'+index)?.value || 0);
    const payoutAmount = Number(r.payout || 0);
    const profitAmount = payoutAmount - betAmount;
    slot.roundId = null;
    slot.status = r.status;
    slot.auto = false;

    updateSlotStatus(
      index,
      r.status === 'cashed_out' ? 'CASHED OUT' : 'CRASHED'
    );

    const result = $('#result'+index);

    if (result) {
      result.textContent = r.status === 'cashed_out'
        ? `আপনি পেয়েছেন BDT ${payoutAmount.toFixed(2)} · লাভ BDT ${profitAmount.toFixed(2)} · ${Number(r.multiplier).toFixed(2)}x · ব্যালেন্স ${money(r.balance)}`
        : 'Cash Out-এর আগেই ক্র্যাশ হয়েছে। পেআউট ০।';
    }

  } catch (e) {
    toast(e.message);
  } finally {
    slot.busy = false;
    updateSlotButtons(index);
  }
}

/* ==========================================
   SUPER ACE
========================================== */

function superAce(g) {
  stopCrashMonitor();

  shell(`
    <div class="game-top top">
      <button class="secondary" onclick="home()">‹ BACK</button>
      <b>${esc(g.name)}</b>
      <span id="gameBalance">${money(me.balance)}</span>
    </div>

    <div class="game-screen">
      <div class="super-board">
        <div class="ace-head">SUPER ACE</div>
        <p class="ace-sub">FREE CARD GAME</p>
        <div class="cards-grid" id="cards">
          ${Array.from({length:20},(_,i) =>
            `<div class="playing-card">${['♠','♥','♦','♣'][i%4]}</div>`
          ).join('')}
        </div>
      </div>

      <div class="card">
        <label>Bet Amount</label>
        <input class="field" id="acebet"
          type="number" min="1" max="1000000" step="1" value="10">
        <button class="primary" id="aceSpin"
          onclick="playAce('${esc(g.id)}')">SPIN</button>
        <div id="result" class="notice">Spin চাপুন</div>
      </div>
    </div>
  `);
}

async function playAce(gameId) {
  const btn = $('#aceSpin');
  btn.disabled = true;

  try {
    const bet = Number($('#acebet').value);

    if (!Number.isSafeInteger(bet) || bet < 1) {
      throw Error('১ বা তার বেশি পূর্ণসংখ্যার বেট দিন');
    }

    const r = await api('/play',{
      gameId,
      betAmount:bet
    });

    me.balance = r.balance;

    const suits = ['♠','♥','♦','♣'];

    $('#cards').innerHTML = Array.from({length:20},() =>
      `<div class="playing-card">${suits[Math.floor(Math.random()*suits.length)]}</div>`
    ).join('');

    $('#result').textContent =
      `ফলাফল ${r.multiplier}x · পেআউট ${r.payout} ক্রেডিট · ব্যালেন্স ${money(r.balance)}`;

    $('#gameBalance').textContent = money(r.balance);

  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}

/* START APPLICATION */
init();
