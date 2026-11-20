
const $ = s => document.querySelector(s);

let token = localStorage.getItem('tk777_token') || '';
let me = null, categories = [], games = [];
let crashTimer = null;
let crashGameId = null;
let crashPollBusy = false;
let crashSlots = [
  { roundId: null, busy: false, status: 'ready' },
  { roundId: null, busy: false, status: 'ready' }
];

const api = async (path, body = null) => {
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
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
  Number(n || 0).toLocaleString('en-US') + ' ক্রেডিট';

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function stopCrashMonitor() {
  if (crashTimer) clearInterval(crashTimer);
  crashTimer = null;
  crashGameId = null;
  crashPollBusy = false;
}

function shell(content) {
  $('#app').innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">TK777<small>PLAY • ENJOY</small></div>
        <div class="top-actions">
          <span class="pill">● ${me ? money(me.balance) : 'Guest'}</span>
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
        ${categories.map((c, i) => `
          <button class="cat" onclick="filterGames('${esc(c.id)}')">
            ${c.image_url
              ? `<img src="${esc(c.image_url)}" alt="" onerror="this.style.display='none'">`
              : `<div class="placeholder">${['🔥','♥','🎰','♛','⚽','🏆','♠','🐟','🎟','🎯','👑','🎁'][i % 12]}</div>`}
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
  ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  localStorage.setItem('tk777_favorites', JSON.stringify(ids));
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

  $('#usernameWrap').classList.toggle('hidden', m !== 'register');
  $('#loginTab').classList.toggle('active', m === 'login');
  $('#registerTab').classList.toggle('active', m === 'register');
  $('#authSubmit').textContent = m === 'register' ? 'Create Account' : 'Login';

  f.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));

    try {
      const r = await api('/' + mode, data);
      token = r.token;
      localStorage.setItem('tk777_token', token);
      me = r.user;
      home();
    } catch (err) {
      toast(err.message);
    }
  };
}

function page(name) {
  stopCrashMonitor();

  if (name === 'member') {
    if (!me) return showAuth();

    shell(`
      <div class="page">
        <div class="card profile-card">
          <h2>Member Center</h2>
          <div class="avatar">${esc((me.username || 'U').slice(0, 1).toUpperCase())}</div>
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
              : 'এই ফ্রি-প্লে ডেমোতে বাস্তব অর্থের ডিপোজিট বা উত্তোলন নেই। অ্যাডমিন অনুমোদিত ফ্রি ক্রেডিট পরিবর্তন হিস্টোরিতে দেখা যাবে।'}
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
  api('/logout', {}).catch(() => {});
  token = '';
  me = null;
  localStorage.removeItem('tk777_token');
  home();
}

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

/* ---------------- CRASH GAME SCREEN ---------------- */

function aviator(g) {
  stopCrashMonitor();

  crashSlots = [
    { roundId: null, busy: false, status: 'ready' },
    { roundId: null, busy: false, status: 'ready' }
  ];

  crashGameId = g.id;

  shell(`
    <div class="top game-top">
      <button class="secondary" onclick="home()">‹ Back</button>
      <b>${esc(g.name)}</b>
      <span id="gameBalance">${money(me.balance)}</span>
    </div>

    <div class="game-screen">
      <div class="aviator-stage" id="aviatorStage">
        <div class="flight-grid"></div>
        <div class="plane" id="plane">✈</div>
        <div class="multiplier" id="multi">1.00x</div>
        <div class="crash-status" id="crashStatus">CONNECTING...</div>
      </div>

      <div class="card">
        <p class="muted">
          একটি গ্লোবাল Crash Round। বিমান সবার জন্য একই সময়ে উড়বে।
          আপনার Cash Out অন্য খেলোয়াড়ের বিমান থামাবে না।
        </p>

        <div class="crash-history-title">
          <b>PREVIOUS CRASHES</b>
          <small>সর্বশেষ ১০ রাউন্ড</small>
        </div>
        <div id="crashHistory" class="crash-history">
          <span class="muted">ফলাফল লোড হচ্ছে...</span>
        </div>
      </div>

      <div class="crash-panels">
        ${[0, 1].map(i => `
          <div class="card betbox crash-bet-panel">
            <div class="crash-panel-head">
              <b>BET ${i + 1}</b>
              <span id="slotStatus${i}">READY</span>
            </div>

            <label>Bet Amount</label>
            <input class="field" id="crashBet${i}"
              type="number" min="1" max="1000000"
              step="1" value="10">

            <label>Auto Cash Out (optional)</label>
            <input class="field" id="autoCashout${i}"
              type="number" min="1.01" max="100"
              step="0.01" placeholder="যেমন 2.00">

            <div class="bet-actions">
              <button class="primary" id="startCrash${i}"
                onclick="startCrash(${i})">BET</button>
              <button class="cashout" id="cashoutBtn${i}"
                disabled onclick="cashout(${i})">CASH OUT</button>
            </div>

            <div id="result${i}" class="notice">
              বেট দিয়ে রাউন্ডে যোগ দিন
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `);

  startCrashMonitor(g.id);
}

/* ---------------- GLOBAL FLIGHT MONITOR ---------------- */

function startCrashMonitor(gameId) {
  stopCrashMonitor();
  crashGameId = gameId;

  pollCrashState();

  crashTimer = setInterval(() => {
    pollCrashState();
  }, 400);
}

function updateCrashHistory(previous) {
  const el = $('#crashHistory');
  if (!el) return;

  if (!previous || !previous.length) {
    el.innerHTML = '<span class="muted">এখনো কোনো Crash History নেই</span>';
    return;
  }

  el.innerHTML = previous.map(x => {
    const n = Number(x.crash_multiplier);
    const cls = n >= 2 ? 'history-high' : 'history-low';

    return `<span class="crash-chip ${cls}">${n.toFixed(2)}x</span>`;
  }).join('');
}

function updateSlotStatus(i, text) {
  const el = $('#slotStatus' + i);
  if (el) el.textContent = text;
}

function updateSlotButtons(i) {
  const slot = crashSlots[i];
  const start = $('#startCrash' + i);
  const cash = $('#cashoutBtn' + i);

  if (!start || !cash) return;

  start.disabled = !!slot.roundId || slot.busy;
  cash.disabled = !slot.roundId || slot.busy || slot.status !== 'active';
}

async function pollCrashState() {
  if (crashPollBusy || !crashGameId) return;
  if (!$('#aviatorStage')) return;

  crashPollBusy = true;

  try {
    const state = await api('/crash/state', {
      gameId: crashGameId
    });

    if (!$('#aviatorStage')) return;

    const multiplier = Number(state.multiplier || 1);
    const multi = $('#multi');
    const plane = $('#plane');
    const status = $('#crashStatus');
    const stage = $('#aviatorStage');

    if (multi) multi.textContent = multiplier.toFixed(2) + 'x';

    if (plane) {
      const distance = Math.max(0, multiplier - 1);
      plane.style.transform =
        `translate(${Math.min(190, distance * 25)}px, ${-Math.min(120, distance * 18)}px) rotate(-15deg)`;
    }

    updateCrashHistory(state.previous || []);

    if (state.status === 'active') {
      stage.classList.add('running');
      status.textContent = 'FLYING';
    } else {
      stage.classList.remove('running');
      status.textContent = 'CRASHED';
      multi.textContent = Number(state.multiplier).toFixed(2) + 'x';
    }

    for (let i = 0; i < crashSlots.length; i++) {
      const slot = crashSlots[i];

      if (!slot.roundId || slot.busy) continue;

      if (slot.status === 'active') {
        try {
          const t = await api('/crash/tick', {
            roundId: slot.roundId
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

            const result = $('#result' + i);
            if (result) {
              result.textContent = t.betStatus === 'cashed_out'
                ? `Cash Out: ${t.multiplier}x · পেআউট ${t.payout} ক্রেডিট`
                : `ক্র্যাশ হয়েছে · পেআউট ০`;
            }

            updateSlotButtons(i);
          }
        } catch (e) {
          console.error('Crash bet status error', e);
        }
      }
    }

  } catch (e) {
    console.error('Crash state error', e);
    const status = $('#crashStatus');
    if (status) status.textContent = 'RECONNECTING...';
  } finally {
    crashPollBusy = false;
  }
}

/* ---------------- PLACE BET ---------------- */

async function startCrash(index) {
  const slot = crashSlots[index];
  if (!slot || slot.roundId || slot.busy) return;

  const betInput = $('#crashBet' + index);
  const button = $('#startCrash' + index);
  const result = $('#result' + index);

  try {
    const bet = Number(betInput.value);

    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000) {
      throw Error('১ থেকে ১০,০০,০০০ এর মধ্যে পূর্ণসংখ্যার বেট দিন');
    }

    slot.busy = true;
    button.disabled = true;

    const r = await api('/crash/start', {
      gameId: crashGameId,
      betAmount: bet
    });

    slot.roundId = r.roundId;
    slot.status = 'active';
    me.balance = r.balance;

    const bal = $('#gameBalance');
    if (bal) bal.textContent = money(me.balance);

    updateSlotStatus(index, 'BET ACTIVE');

    if (result) {
      result.textContent = 'বেট সফল! বিমান উড়ছে। Cash Out করুন।';
    }

  } catch (e) {
    toast(e.message);
    if (result) result.textContent = e.message;
  } finally {
    slot.busy = false;
    updateSlotButtons(index);
  }
}

/* ---------------- CASH OUT ---------------- */

async function cashout(index) {
  const slot = crashSlots[index];

  if (!slot || !slot.roundId || slot.busy) return;

  const roundId = slot.roundId;
  slot.busy = true;
  updateSlotButtons(index);

  try {
    const r = await api('/crash/cashout', {
      roundId
    });

    if (r.balance !== undefined) {
      me.balance = r.balance;
      const bal = $('#gameBalance');
      if (bal) bal.textContent = money(me.balance);
    }

    slot.roundId = null;
    slot.status = r.status;

    updateSlotStatus(
      index,
      r.status === 'cashed_out' ? 'CASHED OUT' : 'CRASHED'
    );

    const result = $('#result' + index);

    if (result) {
      result.textContent = r.status === 'cashed_out'
        ? `Cash Out সফল: ${Number(r.multiplier).toFixed(2)}x · পেআউট ${r.payout} ক্রেডিট · ব্যালেন্স ${money(r.balance)}`
        : 'Cash Out-এর আগেই ক্র্যাশ হয়েছে। পেআউট ০।';
    }

  } catch (e) {
    toast(e.message);
  } finally {
    slot.busy = false;
    updateSlotButtons(index);
  }
}

/* ---------------- SUPER ACE ---------------- */

function superAce(g) {
  stopCrashMonitor();

  shell(`
    <div class="top game-top">
      <button class="secondary" onclick="home()">‹ Back</button>
      <b>${esc(g.name)}</b>
      <span id="gameBalance">${money(me.balance)}</span>
    </div>

    <div class="game-screen">
      <div class="super-board">
        <div class="ace-head">SUPER ACE</div>
        <p class="ace-sub">FREE CARD GAME</p>
        <div class="cards-grid" id="cards">
          ${Array.from({ length: 20 }, (_, i) =>
            `<div class="playing-card">${['♠', '♥', '♦', '♣'][i % 4]}</div>`
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

    const r = await api('/play', {
      gameId,
      betAmount: bet
    });

    me.balance = r.balance;

    const suits = ['♠', '♥', '♦', '♣'];

    $('#cards').innerHTML = Array.from({ length: 20 }, () =>
      `<div class="playing-card">${suits[Math.floor(Math.random() * 4)]}</div>`
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

init();
