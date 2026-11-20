
let token = localStorage.getItem('tk777_token') || '';
let me = null, categories = [], games = [];
let homeBanners = [], homeBannerTimer = null;
let supportSettings = {telegram_username:'',telegram_image_url:''};
const DEFAULT_DEPOSIT_CONTENT = {"fields":{"pageTitle":"Deposit","numberLabel":"NUMBER · COPY ONLY","copyButton":"Copy","numberNotice":"সেন্ড মানি করুন এই নাম্বারে।","paymentTitle":"পেমেন্ট পদ্ধতি","amountLabel":"পরিমাণ","amountPlaceholder":"Amount লিখুন","referenceLabel":"Transaction ID (BDT)","referencePlaceholder":"Transaction ID লিখুন","referenceHint":"ID লিখুন।","submitButton":"Submit Request","historyTitle":"আমার Requests","loadingText":"লোড হচ্ছে…","backButton":"Member Center","chooseMethodError":"আগে একটি পেমেন্ট পদ্ধতি সিলেক্ট করুন।","amountError":"সঠিক Amount লিখুন।","referenceError":"একটি Transaction ID লিখুন।","successMessage":"Request জমা হয়েছে। ২ মিনিটের মধ্যে ব্যালেন্স যোগ হবে ।","emptyHistory":"এখনো কোনো Request নেই","historyDemoSuffix":"(BDT)","statusPending":"Pending","statusAccepted":"Accepted","statusCancelled":"Cancelled","currencyPrefix":"৳"},"categories":[]};
let depositContent = DEFAULT_DEPOSIT_CONTENT;
const DEFAULT_WITHDRAW_CONTENT = {"fields":{"pageTitle":" Withdrawal","safetyNote":"শুধু নগদমূল্যহীন Virtual Coin-এর Demo Request। বিকাশ/নগদ/রকেট।","methodTitle":"পদ্ধতি নির্বাচন করুন","methodBkash":"bKash","methodNagad":"Nagad","methodRocket":"Rocket","demoBadge":"BDT","demoIdsHint":"বিকাশ বা নগদ নির্বাচন করলে পরিচিতি দেখাবে।","demoIdsLabel":"শুধু পরিচিতি:","noDemoIds":" সমস্যা হলে টেলিগ্রামে যোগাযোগ করুন।","amountLabel":" পরিমাণ","amountPlaceholder":"কত টাকা উইথড্র করতে চান","balanceLabel":"বর্তমান ব্যালেন্স:","coinSuffix":"Coin","submitButton":"Submit Demo Withdrawal","historyTitle":"আমার Withdrawal Requests","loadingText":"লোড হচ্ছে…","emptyHistory":"এখনো কোনো Request নেই","recordTitle":"Withdrawal Record","emptyRecord":"কোনো Withdrawal Record নেই","backButton":"Member Center","chooseMethodError":"বিকাশ, নগদ অথবা রকেট নির্বাচন করুন।","amountError":"সঠিক কয়েনের পরিমাণ লিখুন।","balanceError":"আপনার ব্যালেন্সে পর্যাপ্ত ব্যালেন্স নেই।","successMessage":"Request জমা হয়েছে। নির্ধারিত Virtual Coin সঙ্গে সঙ্গে ব্যালেন্স থেকে কেটে Pending থাকবে; Admin বাতিল করলে কয়েন ফেরত আসবে। কোনো টাকা পাঠানো হবে না।","statusPending":"Pending","statusApproved":"Approved","statusRejected":"Rejected","historyCoinSuffix":"Virtual Coin"}};
let withdrawContent = DEFAULT_WITHDRAW_CONTENT;
function withdrawText(key){return String((withdrawContent.fields||{})[key] ?? (DEFAULT_WITHDRAW_CONTENT.fields||{})[key] ?? '');}
function depositText(key){return String((depositContent.fields||{})[key] ?? (DEFAULT_DEPOSIT_CONTENT.fields||{})[key] ?? '');}
function depositExtraCategories(){return (Array.isArray(depositContent.categories)?depositContent.categories:[]).map(c=>'<div class="card"><h3>'+esc(c.title||'')+'</h3><p>'+esc(c.text||'')+'</p></div>').join('');}
let demoPaymentImages = {bkash:'',nagad:'',rocket:''};
let demoMethodNumbers = {bkash:'12345678912',nagad:'55555555555',rocket:'33333333333'};
let withdrawDemoIds = {bkash:['BKASH-01'],nagad:['NAGAD-01'],rocket:['ROCKET-01']};
let slotDisplayImages = {}, slotDisplayHidden = [];
let isPlayingGame = false;
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
let crashServerClockOffset = 0;
let crashVisualCrashMultiplier = null;
let aviatorCrowdSession = null;
let aviatorCrowdPeak = 1832;


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

const TK777_AVATARS = ['😎','🧑🏻‍🚀','🐼','🐧','🐯'];
function selectedAvatar() {
  const n = Number(localStorage.getItem('tk777_profile_avatar') || 0);
  return Number.isInteger(n) && n >= 0 && n < TK777_AVATARS.length ? n : 0;
}
function avatarImage(index, extraClass) {
  const emoji = TK777_AVATARS[index] || TK777_AVATARS[0];
  const colors = [['#ffe36a','#e69b22'],['#8bd9ff','#3475bd'],['#f7f7f7','#aab8c7'],['#a6f2e1','#299b89'],['#ffbf72','#d65c2b']];
  const pair = colors[index] || colors[0];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="'+pair[0]+'"/><stop offset="1" stop-color="'+pair[1]+'"/></linearGradient></defs><circle cx="50" cy="50" r="49" fill="url(#g)"/><circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-opacity=".65" stroke-width="3"/><text x="50" y="68" text-anchor="middle" font-size="62">'+emoji+'</text></svg>';
  return '<img class="'+(extraClass || '')+'" alt="Profile avatar" src="data:image/svg+xml,'+encodeURIComponent(svg)+'">';
}
function toggleAvatarPicker() {
  const panel = document.getElementById('avatarPicker');
  if (panel) panel.hidden = !panel.hidden;
}
function chooseAvatar(index) {
  if (!Number.isInteger(index) || index < 0 || index >= TK777_AVATARS.length) return;
  localStorage.setItem('tk777_profile_avatar',String(index));
  const current = document.getElementById('topProfileAvatar');
  if (current) current.outerHTML = avatarImage(index,'top-profile-avatar').replace('<img ','<img id="topProfileAvatar" ');
  const member = document.getElementById('memberProfileAvatar');
  if (member) member.outerHTML = avatarImage(index,'member-profile-avatar').replace('<img ','<img id="memberProfileAvatar" ');
  const panel = document.getElementById('avatarPicker');
  if (panel) panel.hidden = true;
}

async function refreshBalance(button) {
  if (!me || !token) return showAuth();
  if (button) button.classList.add('is-refreshing');
  try {
    const data = await api('/me');
    me = data.user;
    const amount = money(me.balance);
    const top = document.getElementById('topBalanceValue');
    const member = document.getElementById('memberBalanceValue');
    const game = document.getElementById('gameBalance');
    if (top) top.textContent = amount;
    if (member) member.textContent = amount;
    if (game) game.textContent = amount;
    toast('ব্যালেন্স আপডেট হয়েছে');
  } catch (e) {
    toast(e.message || 'ব্যালেন্স রিফ্রেশ করা যায়নি');
  } finally {
    if (button) button.classList.remove('is-refreshing');
  }
}

function memberCenter() {
  shell(`
    <div class="member-page">
      <section class="member-profile-card">
        <div class="member-profile-main">
          <button class="member-avatar-button" onclick="toggleAvatarPicker()" aria-label="প্রোফাইল ছবি পরিবর্তন">
            ${avatarImage(selectedAvatar(),'member-large-avatar').replace('<img ','<img id="memberProfileAvatar" ')}
          </button>
          <div class="member-identity">
            <span class="member-level">✦ TK777 MEMBER</span>
            <h2>${esc(me.username || 'Member')}</h2>
            <p>${esc(me.email || '')}</p>
          </div>
        </div>
        <div class="member-balance">
          <div><small>AVAILABLE BALANCE</small><strong id="memberBalanceValue">${money(me.balance)}</strong></div>
          <button type="button" onclick="refreshBalance(this)" aria-label="Refresh balance">↻</button>
        </div>
        <div class="member-shortcuts">
          <button onclick="page('deposit')">Deposit</button>
          <button onclick="page('withdraw')">Withdrawal</button>
          <button onclick="page('bank')">Bank Account</button>
        </div>
      </section>
      <div class="member-section-title"><span>Member Center</span></div>
      <div class="member-menu-grid">
        <button onclick="page('reward')"><i>🏆</i><span>My Rewards</span></button>
        <button onclick="page('history')"><i>✥</i><span>Bet History</span></button>
        <button onclick="page('profitloss')"><i>▤</i><span>Profit And Loss</span></button>
        <button onclick="page('depositRecord')"><i>📋</i><span>Deposit Record</span></button>
        <button onclick="page('withdrawRecord')"><i>📥</i><span>Withdrawal Record</span></button>
        <button onclick="page('history')"><i>▣</i><span>Transaction History</span></button>
        <button onclick="page('account')"><i>♙</i><span>My Account</span></button>
        <button onclick="page('security')"><i>♢</i><span>Security Center</span></button>
        <button onclick="page('invite')"><i>♧</i><span>Invite Friends</span></button>
        <button onclick="page('mission')"><i>🎁</i><span>Mission</span></button>
        <button onclick="page('rebate')"><i>◉</i><span>Rebate</span></button>
        <button onclick="page('messages')"><i>✉</i><span>Internal Message</span></button>
        <button onclick="page('suggestion')"><i>☏</i><span>Suggestion</span></button>
        <button onclick="page('download')"><i>⇩</i><span>Download App</span></button>
        <button onclick="page('service')"><i>◷</i><span>Customer Service</span></button>
        <button onclick="logout()"><i>⇥</i><span>Logout</span></button>
      </div>
    </div>
  `);
}

async function profitLossPage() {
  if (!me) return showAuth();
  try {
    const d = await api('/history');
    const rounds = d.rounds || [];
    const wagered = rounds.reduce((sum,r)=>sum+Number(r.bet_amount||0),0);
    const returned = rounds.reduce((sum,r)=>sum+Number(r.payout||0),0);
    const net = returned - wagered;
    shell(`
      <div class="page">
        <h3>Profit And Loss</h3>
        <div class="card profit-summary">
          <small>Total Bet</small><strong>${money(wagered)}</strong>
          <small>Total Payout</small><strong>${money(returned)}</strong>
          <small>Net ${net >= 0 ? 'Profit' : 'Loss'}</small><strong class="${net >= 0 ? 'gold' : 'loss'}">${net >= 0 ? '+' : ''}${money(net)}</strong>
        </div>
        <div class="card">
          ${rounds.map(r=>'<div class="history-row"><span>'+esc(r.game_id)+'<small>Bet '+Number(r.bet_amount||0)+' · '+Number(r.multiplier||0)+'x</small></span><b>'+money(r.payout||0)+'</b></div>').join('') || 'এখনো কোনো গেম রেকর্ড নেই'}
        </div>
        <button class="secondary" onclick="page('member')">Member Center</button>
      </div>
    `);
  } catch(e) { toast(e.message); }
}

function shell(content) {
  $('#app').innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">TK777<small>PLAY • ENJOY</small></div>
        <div class="top-actions">
          ${me ? '<div class="balance-chip"><span id="topBalanceValue">'+money(me.balance)+'</span><button class="balance-refresh" type="button" onclick="refreshBalance(this)" aria-label="Refresh balance">↻</button></div>' : ''}
          ${me ? '<button class="top-profile-button" aria-label="Choose profile picture" onclick="toggleAvatarPicker()">'+avatarImage(selectedAvatar(),'top-profile-avatar')+'</button>' : '<button onclick="showAuth()">Login</button>'}
        </div>
        ${me ? '<div class="avatar-picker" id="avatarPicker" hidden><b>Choose Profile</b><div class="avatar-choices">'+TK777_AVATARS.map((_,i)=>'<button class="avatar-choice '+(i===selectedAvatar()?'selected':'')+'" onclick="chooseAvatar('+i+')">'+avatarImage(i,'')+'</button>').join('')+'</div></div>' : ''}
      </header>

      ${content}

      <nav class="bottom">
        <button onclick="home()"><b>⌂</b>Home</button>
        <button onclick="page('promotion')"><b>🎁</b>Promotion</button>
        <button onclick="page('invite')"><b>♧</b>Invite</button>
        <button onclick="page('reward')"><b>★</b>Reward</button>
        <button onclick="page('member')"><b>♙</b>Member</button>
      </nav>
      ${!isPlayingGame ? `<button class="telegram-support-float" type="button" onclick="openTelegramSupport()" aria-label="Telegram Support">${supportSettings.telegram_image_url ? `<img src="${esc(supportSettings.telegram_image_url)}" alt="Support">` : '<span>➤</span>'}</button>` : ''}
    </div>`;
}

function openTelegramSupport() {
  const username = String(supportSettings.telegram_username || '').trim().replace(/^@/,'').replace(/[^A-Za-z0-9_]/g,'');
  if (!username) return toast('Telegram Support এখনো সেট করা হয়নি');
  window.open('https://t.me/' + username,'_blank','noopener');
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
    homeBanners = (await api('/home-banners')).banners || [];
    supportSettings = await api('/support-settings');
    demoPaymentImages = supportSettings.demo_payment_images || {bkash:'',nagad:'',rocket:''};
    demoMethodNumbers = supportSettings.demo_numbers || demoMethodNumbers;
    withdrawDemoIds = supportSettings.withdraw_demo_ids || withdrawDemoIds;
    depositContent = supportSettings.deposit_content || DEFAULT_DEPOSIT_CONTENT;
    withdrawContent = supportSettings.withdraw_content || DEFAULT_WITHDRAW_CONTENT;
    const slotDisplayData = await api('/slot-display-images');
    slotDisplayImages = slotDisplayData.images || {};
    slotDisplayHidden = Array.isArray(slotDisplayData.hiddenIds) ? slotDisplayData.hiddenIds : [];
    const slotNameOverrides = slotDisplayData.nameOverrides || {};
    displaySlotGames.forEach(g => { if (typeof slotNameOverrides[g.id] === 'string' && slotNameOverrides[g.id].trim()) g.name = slotNameOverrides[g.id].trim(); });
  } catch (e) {
    toast(e.message);
  }

  home();
}


function renderHomeBanners() {
  if (!homeBanners.length) return '<div class="hero"><div class="hero-copy"><span class="hero-tag">WELCOME TO</span><h2>TK777</h2><p>PLAY • EXPLORE • ENJOY</p><small>Free-play arcade experience</small></div><div class="hero-mark">777</div></div>';
  return '<div class="home-banner-wrap"><div class="home-banner-track" id="homeBannerTrack">' + homeBanners.map((url,i) => '<div class="home-banner-slide"><img src="' + esc(url) + '" alt="TK777 Banner ' + (i+1) + '"></div>').join('') + '</div>' + (homeBanners.length > 1 ? '<div class="home-banner-dots">' + homeBanners.map((_,i) => '<button class="' + (i===0?'active':'') + '" onclick="goHomeBanner(' + i + ')" aria-label="Banner ' + (i+1) + '"></button>').join('') + '</div>' : '') + '</div>';
}
function setupHomeBanners() {
  const track = document.getElementById('homeBannerTrack');
  if (!track || homeBanners.length < 2) return;
  let index = 0;
  const dots = document.querySelectorAll('.home-banner-dots button');
  window.goHomeBanner = function(n) {
    index = (n + homeBanners.length) % homeBanners.length;
    track.scrollTo({left:track.clientWidth * index,behavior:'smooth'});
    dots.forEach((d,i) => d.classList.toggle('active',i===index));
  };
  let sx = 0;
  track.addEventListener('touchstart',e => {sx=e.touches[0].clientX;},{passive:true});
  track.addEventListener('touchend',e => {const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>35)window.goHomeBanner(index+(dx<0?1:-1));},{passive:true});
  homeBannerTimer = setInterval(() => window.goHomeBanner(index+1),5000);
}

/* HOME */

function home() {
  isPlayingGame = false;
  stopCrashMonitor();
  if (homeBannerTimer) clearInterval(homeBannerTimer);
  homeBannerTimer = null;

  shell(`
    ${renderHomeBanners()}

    <div class="home-money-actions"><button onclick="page('deposit')">＋ Deposit</button><button onclick="page('withdraw')">↗ Withdraw</button></div>
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
        <small>${games.length + displaySlotGames.length} GAMES</small>
      </div>
      <div class="games">${homeGamesWithSlots().map(g => g.id.startsWith('slot-display-') ? displaySlotCard(g) : gameCard(g)).join('')}</div>
    </div>

    <div class="section">
      <div class="notice">
        ভাগ্য পরীক্ষা করতে পছন্দের গেম বেছে নিন। TK777-এ উপভোগ করুন আকর্ষণীয় গেমিং অভিজ্ঞতা
      </div>
    </div>
  `);
  setupHomeBanners();
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

// Display-only Slot cards; no game files or play links yet.
const displaySlotGames = [
  {id:'slot-display-super-elements',name:'Super Elements',mark:'⚡',tone:'elements'},
  {id:'slot-display-azteca-legacy',name:'Azteca Legacy',mark:'☀',tone:'azteca'},
  {id:'slot-display-flyx',name:'FlyX',mark:'✈',tone:'flyx'},
  {id:'slot-display-magic-ace',name:'Magic Ace',mark:'♣',tone:'magic'},
  {id:'slot-display-circus-joker',name:'Circus Joker',mark:'🃏',tone:'circus'},
  {id:'slot-display-fortune-gems-3',name:'Fortune Gems 3',mark:'💎',tone:'fortune'},
  {id:'slot-display-super-ace-ii',name:'Super Ace II',mark:'♛',tone:'ace2'},
  {id:'slot-display-boxing-king',name:'Boxing King',mark:'🥊',tone:'boxing'},
  {id:'slot-display-super-ace-deluxe',name:'Super Ace Deluxe',mark:'♛',tone:'deluxe'},
  {id:'slot-display-dragon-gems',name:'Dragon Gems',mark:'🐉',tone:'dragon'},
  {id:'slot-display-treasures-of-aztec',name:'Treasures of Aztec',mark:'☀',tone:'treasures'},
  {id:'slot-display-anubis-wrath',name:'Anubis Wrath',mark:'𓃥',tone:'anubis'},
  {id:'slot-display-golden-empire',name:'Golden Empire',mark:'👑',tone:'azteca'},
  {id:'slot-display-money-coming',name:'Money Coming',mark:'💰',tone:'fortune'},
  {id:'slot-display-fortune-gems',name:'Fortune Gems',mark:'💎',tone:'fortune'},
  {id:'slot-display-fortune-gems-2',name:'Fortune Gems 2',mark:'💎',tone:'fortune'},
  {id:'slot-display-devil-fire-2',name:'Devil Fire 2',mark:'🔥',tone:'flyx'},
  {id:'slot-display-zeus',name:'Zeus',mark:'⚡',tone:'elements'},
  {id:'slot-display-wild-ace',name:'Wild Ace',mark:'🂡',tone:'ace2'},
  {id:'slot-display-golden-bank',name:'Golden Bank',mark:'🏦',tone:'deluxe'},
  {id:'slot-display-party-night',name:'Party Night',mark:'🎉',tone:'circus'},
  {id:'slot-display-lucky-goldbricks',name:'Lucky Goldbricks',mark:'🧱',tone:'treasures'},
  {id:'slot-display-mahjong-ways',name:'Mahjong Ways',mark:'🀄',tone:'elements'},
  {id:'slot-display-mahjong-ways-2',name:'Mahjong Ways 2',mark:'🀄',tone:'elements'},
  {id:'slot-display-fortune-tiger',name:'Fortune Tiger',mark:'🐯',tone:'fortune'},
  {id:'slot-display-fortune-ox',name:'Fortune Ox',mark:'🐂',tone:'azteca'},
  {id:'slot-display-fortune-rabbit',name:'Fortune Rabbit',mark:'🐇',tone:'magic'},
  {id:'slot-display-lucky-neko',name:'Lucky Neko',mark:'🐱',tone:'fortune'},  {id:'slot-display-dragon-hatch',name:'Dragon Hatch',mark:'🐉',tone:'dragon'},  {id:'slot-display-ganesha-fortune',name:'Ganesha Fortune',mark:'🐘',tone:'treasures'},  {id:'slot-display-wild-bandito',name:'Wild Bandito',mark:'🤠',tone:'flyx'},
  {id:'slot-display-ways-of-the-qilin',name:'Ways of the Qilin',mark:'🐉',tone:'anubis'}
];

function displaySlotCard(g) {
  const image = slotDisplayImages[g.id] || '';
  const art = image
    ? '<img class="slot-admin-image" src="' + esc(image) + '" alt="' + esc(g.name) + '" loading="lazy">'
    : '<div class="slot-poster slot-' + esc(g.tone) + '"><span class="slot-poster-mark">' + g.mark + '</span></div>';
  return '<div class="game display-slot-game" aria-label="' + esc(g.name) + '">' + art + '<strong>' + esc(g.name) + '</strong><small>SLOT GAME</small></div>';
}

function homeGamesWithSlots() {
  const list = [...games];
  const at = list.findIndex(g => /super\s*ace/i.test(String(g.name || '')));
  list.splice(at < 0 ? list.length : at + 1, 0, ...displaySlotGames.filter(g => !slotDisplayHidden.includes(g.id)));
  return list;
}
function filterGames(id) {
  isPlayingGame = false;
  const c = categories.find(x => x.id === id);
  const isSlotsCategory = /slot/i.test(String(c?.name || ''));
  const list = id === 'favorites'
    ? games.filter(g => favoriteIds().includes(g.id))
    : [...games.filter(g => g.category_id === id), ...(isSlotsCategory ? displaySlotGames.filter(g => !slotDisplayHidden.includes(g.id)) : [])];

  stopCrashMonitor();

  shell(`
    <div class="page">
      <div class="section-head">
        <span>${esc(c?.name || 'Games')}</span>
        <small>${list.length} GAMES</small>
      </div>
      <div class="games">
        ${list.map(g => g.id.startsWith('slot-display-') ? displaySlotCard(g) : gameCard(g)).join('') || '<p class="muted">এই ক্যাটাগরিতে এখনো গেম যোগ করা হয়নি।</p>'}
      </div>
      <button class="secondary" onclick="home()">ফিরে যান</button>
    </div>
  `);
}

/* LOGIN AND REGISTER */

function showAuth() {
  isPlayingGame = false;
  stopCrashMonitor();
  shell(`
    <div class="page"><div class="card auth-card">
      <h2>Welcome to TK777</h2>
      <div class="tabs">
        <button id="loginTab" class="active" onclick="authMode('login')">Login</button>
        <button id="registerTab" onclick="authMode('register')">Create Account</button>
      </div>
      <style>
        .password-field{position:relative;display:flex;align-items:center}
        .password-field .field{width:100%;padding-right:48px}
        .password-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:36px;height:36px;padding:0;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}
        .password-toggle svg{width:20px;height:20px}
      </style>
      <form id="authform">
        <label>মোবাইল নম্বর</label>
        <input class="field" name="phone" type="tel" inputmode="numeric" required autocomplete="tel" placeholder="01XXXXXXXXX">
        <label>Password</label>
        <div class="password-field">
          <input class="field" name="password" type="password" minlength="6" maxlength="128" required autocomplete="current-password" placeholder="কমপক্ষে ৬ অক্ষর">
          <button class="password-toggle" type="button" data-toggle-password="password" aria-label="পাসওয়ার্ড দেখান" title="পাসওয়ার্ড দেখান"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
        </div>
        <div id="confirmPasswordWrap" class="hidden">
          <label>Confirm Password</label>
          <div class="password-field">
            <input class="field" name="confirmPassword" type="password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="পাসওয়ার্ড আবার লিখুন">
            <button class="password-toggle" type="button" data-toggle-password="confirmPassword" aria-label="কনফার্ম পাসওয়ার্ড দেখান" title="পাসওয়ার্ড দেখান"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
          </div>
        </div>
        <button class="primary" id="authSubmit">Login</button>
      </form>
      <p class="muted" id="authHint">সঠিক ভাবে লগইন করুন</p>
    </div></div>`);
  authMode('login');
}
let mode = 'login';
function authMode(m) {
  mode = m;
  const currentMode = m;
  const f = $('#authform');
  if (!f) return;
  $('#confirmPasswordWrap').classList.toggle('hidden',m !== 'register');
  f.elements.confirmPassword.required = m === 'register';
  f.elements.password.autocomplete = m === 'register' ? 'new-password' : 'current-password';
  $('#loginTab').classList.toggle('active',m === 'login');
  $('#registerTab').classList.toggle('active',m === 'register');
  $('#authSubmit').textContent = m === 'register' ? 'Create Account' : 'Login';
  $('#authHint').textContent = m === 'register' ? 'সঠিক ভাবে রেজিষ্ট্রেশন করুন' : 'সঠিক ভাবে লগইন করুন';
  f.querySelectorAll('[data-toggle-password]').forEach(btn => {
    btn.onclick = () => {
      const input = f.querySelector('[name="' + btn.dataset.togglePassword + '"]');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান');
      btn.title = show ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান';
    };
  });
  f.onsubmit = async e => {
    e.preventDefault();
    const passwordInput = f.querySelector('input[name="password"]');
    const confirmInput = f.querySelector('input[name="confirmPassword"]');
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    // Ignore accidental leading/trailing whitespace and equivalent Unicode forms.
    if (currentMode === 'register' && password !== confirmPassword) {
      toast('পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না');
      confirmInput.focus();
      return;
    }
    const data = { phone: f.querySelector('input[name="phone"]').value, password };
    if(currentMode==='register'){
      data.confirmPassword=confirmPassword;
      data.referralCode=new URLSearchParams(window.location.search).get('ref')||'';
    }
    try {
      const r = await api('/'+currentMode,data);
      token = r.token;
      localStorage.setItem('tk777_token',token);
      me = r.user;
      home();
    } catch (err) { toast(err.message); }
  };
}
/* MEMBER AND PAGES */



let selectedWithdrawMethod = '';
function selectWithdrawMethod(method){
  selectedWithdrawMethod=method;
  document.querySelectorAll('.withdraw-method').forEach(el=>{
    const on=el.dataset.method===method;
    el.classList.toggle('selected',on);
    el.setAttribute('aria-pressed',on?'true':'false');
  });
}
function showWithdrawDemoIds(kind){
 const box=document.getElementById('withdrawDemoIdList');if(!box)return;
 const ids=kind?(withdrawDemoIds[kind]||[]):[];
 box.innerHTML=ids.length?'<small>'+esc(withdrawText('demoIdsLabel'))+' </small>'+ids.map(x=>'<span class="demo-withdraw-code">'+esc(x)+'</span>').join(' '):'<small>'+esc(withdrawText('noDemoIds'))+'</small>';
}
async function withdrawPage(){
 if(!me)return showAuth();selectedWithdrawMethod='';
 shell(`<div class="page member-subpage"><div class="member-subpage-heading"><button onclick="page('member')">‹</button><h2>${esc(withdrawText('pageTitle'))}</h2></div>
 <div class="card coin-request-card"><p class="muted">${esc(withdrawText('safetyNote'))}</p><h3>${esc(withdrawText('methodTitle'))}</h3><div class="demo-payment-methods">
 <button type="button" class="demo-payment-method withdraw-method" data-method="Demo bKash" onclick="selectWithdrawMethod('Demo bKash');showWithdrawDemoIds('bkash')">${esc(withdrawText('methodBkash'))} <small>${esc(withdrawText('demoBadge'))}</small></button>
 <button type="button" class="demo-payment-method withdraw-method" data-method="Demo Nagad" onclick="selectWithdrawMethod('Demo Nagad');showWithdrawDemoIds('nagad')">${esc(withdrawText('methodNagad'))} <small>${esc(withdrawText('demoBadge'))}</small></button>
 <button type="button" class="demo-payment-method withdraw-method" data-method="Demo Rocket" onclick="selectWithdrawMethod('Demo Rocket');showWithdrawDemoIds('rocket')">${esc(withdrawText('methodRocket'))} <small>${esc(withdrawText('demoBadge'))}</small></button></div>
 <div id="withdrawDemoIdList" class="muted">${esc(withdrawText('demoIdsHint'))}</div><label for="withdrawCoinAmount">${esc(withdrawText('amountLabel'))}</label><input id="withdrawCoinAmount" class="field" type="number" min="1" step="1" inputmode="numeric" placeholder="${esc(withdrawText('amountPlaceholder'))}">
 <small class="muted">${esc(withdrawText('balanceLabel'))} <b>${Number(me.balance||0).toLocaleString('en-US')} ${esc(withdrawText('coinSuffix'))}</b></small><button class="primary" onclick="submitWithdrawRequest()">${esc(withdrawText('submitButton'))}</button><p id="withdrawRequestMsg" class="muted"></p></div>
 <h3>${esc(withdrawText('historyTitle'))}</h3><div id="withdrawRequestHistory" class="card">${esc(withdrawText('loadingText'))}</div><button class="secondary" onclick="page('member')">${esc(withdrawText('backButton'))}</button></div>`);
 loadWithdrawRequests();
}
async function loadWithdrawRequests(){
 const box=document.getElementById('withdrawRequestHistory');if(!box)return;
 try{const d=await api('/withdraw-requests');box.innerHTML=(d.requests||[]).map(x=>'<div class="history-row"><span>'+esc(x.method)+' · '+Number(x.amount)+' '+esc(withdrawText('historyCoinSuffix'))+'<small>'+esc(x.created_at)+'</small></span><b>'+esc(x.status==='approved'?withdrawText('statusApproved'):x.status==='rejected'?withdrawText('statusRejected'):withdrawText('statusPending'))+'</b></div>').join('')||esc(withdrawText('emptyHistory'));}catch(e){box.textContent=e.message;}
}
async function withdrawRecordPage(){
 if(!me)return showAuth();
 shell('<div class="page member-subpage"><div class="member-subpage-heading"><button onclick="page(\'member\')">‹</button><h2>'+esc(withdrawText('recordTitle'))+'</h2></div><div id="withdrawRecordList" class="card">'+esc(withdrawText('loadingText'))+'</div><button class="secondary" onclick="page(\'member\')">'+esc(withdrawText('backButton'))+'</button></div>');
 const box=document.getElementById('withdrawRecordList');
 try{const d=await api('/withdraw-requests');box.innerHTML=(d.requests||[]).map(x=>'<div class="history-row"><span>'+esc(x.method)+' · '+Number(x.amount)+' '+esc(withdrawText('historyCoinSuffix'))+'<small>'+esc(x.created_at)+'</small></span><b>'+esc(x.status==='approved'?withdrawText('statusApproved'):x.status==='rejected'?withdrawText('statusRejected'):withdrawText('statusPending'))+'</b></div>').join('')||esc(withdrawText('emptyRecord'));}catch(e){box.textContent=e.message;}
}
async function submitWithdrawRequest(){
 const msg=document.getElementById('withdrawRequestMsg');if(!msg)return;
 const amount=Number(document.getElementById('withdrawCoinAmount')?.value);
 if(!selectedWithdrawMethod){msg.textContent=withdrawText('chooseMethodError');return;}
 if(!Number.isSafeInteger(amount)||amount<1){msg.textContent=withdrawText('amountError');return;}
 if(amount>Number(me.balance||0)){msg.textContent=withdrawText('balanceError');return;}
 try{await api('/withdraw-requests',{method:selectedWithdrawMethod,amount});msg.textContent=withdrawText('successMessage');await loadWithdrawRequests();await refreshBalance();}
 catch(e){msg.textContent=e.message;}
}



async function inviteFriendsPage() {
  if(!me)return showAuth();
  shell('<div class="page"><div class="member-subpage-heading"><button onclick="page(\'member\')" aria-label="Back">‹</button><h2>Invite Friends</h2></div><div class="card"><h3>আপনার Referral Link</h3><p>বন্ধুকে এই লিংক পাঠান। নতুন প্লেয়ার রেজিস্ট্রেশন করে ২০০ Virtual Coin বা বেশি ব্যালেন্সে পৌঁছালে আপনি অটোমেটিক ১০৮ Virtual Coin পাবেন।</p><input class="field" id="referralLink" readonly value="লোড হচ্ছে..."><button class="primary" id="copyReferralLink" type="button">Copy Invite Link</button><div id="referralMsg" class="muted"></div></div><div class="card"><h3>Referral Summary</h3><p>মোট Invite: <b id="refTotal">—</b></p><p>শর্ত পূরণ করেছে: <b id="refQualified">—</b></p><p>মোট Referral Bonus: <b id="refEarned">—</b> Virtual Coin</p></div></div>');
  try{
    const d=await api('/referral'),link=window.location.origin+'/?ref='+encodeURIComponent(d.code),input=document.getElementById('referralLink');
    if(input)input.value=link;
    document.getElementById('refTotal').textContent=d.total;
    document.getElementById('refQualified').textContent=d.qualified;
    document.getElementById('refEarned').textContent=d.earned;
    document.getElementById('copyReferralLink').onclick=async()=>{
      try{await navigator.clipboard.writeText(link);document.getElementById('referralMsg').textContent='Referral Link কপি হয়েছে।';}
      catch{input.select();document.execCommand('copy');document.getElementById('referralMsg').textContent='Referral Link কপি হয়েছে।';}
    };
  }catch(e){const m=document.getElementById('referralMsg');if(m)m.textContent=e.message;}
}

function page(name) {
  isPlayingGame = false;
  stopCrashMonitor();
  if (name === 'member') return memberCenter();
  if (name === 'invite') return inviteFriendsPage();
  if (name === 'deposit') return depositPage();
  if (name === 'withdraw') return withdrawPage();
  if (name === 'withdrawRecord') return withdrawRecordPage();
  if (name === 'history') return historyPage();
  if (name === 'profitloss') return profitLossPage();

  const pages = {
    deposit: ['Deposit Information','TK777 একটি ফ্রি-প্লে গেমিং ডেমো। এখানে শুধু নগদমূল্যহীন Virtual Coin ব্যবহার করা হয়। বাস্তব টাকা জমা করা যায় না।'],
    withdraw: ['Withdrawal Information','TK777-তে শুধু নগদমূল্যহীন Virtual Coin ব্যবহার করা হয়। বাস্তব টাকা উত্তোলন করা যায় না।'],
    bank: ['Bank Account','এই ডেমোতে কোনো ব্যাংক অ্যাকাউন্ট বা বাস্তব অর্থের লেনদেন সংরক্ষণ করা হয় না।'],
    depositRecord: ['Deposit Record','এই ফ্রি-প্লে ডেমোতে বাস্তব অর্থের ডিপোজিট নেই, তাই Deposit Record প্রযোজ্য নয়।'],
    withdrawRecord: ['Withdrawal Record','এই ফ্রি-প্লে ডেমোতে বাস্তব অর্থের উত্তোলন নেই, তাই Withdrawal Record প্রযোজ্য নয়।'],
    account: ['My Account','আপনার প্রোফাইল ছবি পরিবর্তন করতে উপরের প্রোফাইল আইকনে চাপ দিন।'],
    security: ['Security Center','আপনার অ্যাকাউন্ট নিরাপদ রাখতে লগইন তথ্য গোপন রাখুন এবং নিজের ডিভাইস থেকে লগআউট করতে ভুলবেন না।'],
    invite: ['Invite Friends','এই ডেমোতে রেফারেল বোনাস চালু নেই।'],
    mission: ['Mission','বর্তমানে কোনো মিশন চালু নেই।'],
    rebate: ['Rebate','এই ডেমোতে রিবেট সুবিধা চালু নেই।'],
    messages: ['Internal Message','আপনার জন্য নতুন কোনো বার্তা নেই।'],
    suggestion: ['Suggestion','পরামর্শ জমা দেওয়ার সুবিধা শিগগিরই যুক্ত করা হবে।'],
    download: ['Download App','TK777-এর অ্যাপ ডাউনলোড বর্তমানে উপলব্ধ নয়।'],
    service: ['Customer Service','কাস্টমার সার্ভিসের যোগাযোগের তথ্য বর্তমানে যুক্ত করা হয়নি।'],
    reward: ['Reward Center','বর্তমানে কোনো নতুন রিওয়ার্ড নেই।'],
    promotion: ['Promotion','বর্তমানে কোনো নতুন প্রমোশন নেই।']
  };
  const item = pages[name] || ['TK777','এই পেজটি বর্তমানে উপলব্ধ নয়।'];
  shell(`
    <div class="page member-subpage">
      <div class="member-subpage-heading"><button onclick="page('member')" aria-label="Back">‹</button><h2>${esc(item[0])}</h2></div>
      <div class="card"><p>${esc(item[1])}</p></div>
      <button class="secondary" onclick="page('member')">Member Center</button>
    </div>
  `);
}


function selectDemoMethod(method){
  const input=document.getElementById('demoPaymentMethod');
  if(!input)return;
  input.value=method;
  const demoNumbers={
    'Demo bKash':demoMethodNumbers.bkash,
    'Demo Nagad':demoMethodNumbers.nagad,
    'Demo Rocket':demoMethodNumbers.rocket
  };
  const number=document.getElementById('demoDisplayNumber');
  if(number && demoNumbers[method]) number.textContent=demoNumbers[method];
  document.querySelectorAll('.demo-payment-method').forEach(el=>{
    const selected=el.dataset.method===method;
    el.classList.toggle('selected',selected);
    el.setAttribute('aria-pressed',selected?'true':'false');
  });
}
function selectDemoAmount(amount){
  const input=document.getElementById('demoAmount');
  if(!input)return;
  input.value=String(amount);
  document.querySelectorAll('.demo-amount-button').forEach(el=>{
    const selected=Number(el.dataset.amount)===Number(amount);
    el.classList.toggle('selected',selected);
    el.setAttribute('aria-pressed',selected?'true':'false');
  });
}
function syncDemoAmountInput(){
  const input=document.getElementById('demoAmount');
  if(!input)return;
  document.querySelectorAll('.demo-amount-button').forEach(el=>{
    const selected=el.dataset.amount===input.value;
    el.classList.toggle('selected',selected);
    el.setAttribute('aria-pressed',selected?'true':'false');
  });
}
async function depositPage(){
  if(!me) return showAuth();
  const t=depositText;
  shell(`<div class="page member-subpage">
    <div class="member-subpage-heading"><button onclick="page('member')">‹</button><h2>${esc(t('pageTitle'))}</h2></div>
    <style>.demo-number-panel{margin:12px 0;padding:15px 12px;border:1px solid #c9a24e;border-radius:13px;background:linear-gradient(145deg,#173d39,#0b292f);text-align:center;box-shadow:0 5px 14px #0004}
.demo-number-label{font-size:10px;font-weight:1000;letter-spacing:1.5px;color:#f5d77e}
.demo-number-row{display:flex;align-items:center;justify-content:center;gap:12px;margin:8px 0}
.demo-number-row strong{font-size:clamp(25px,7vw,34px);letter-spacing:1.5px;color:#fff1bd;text-shadow:0 2px 8px #0008}
.demo-number-row button{padding:9px 14px;border:1px solid #f3d17c;border-radius:9px;background:linear-gradient(145deg,#ffe58a,#d59a2e);color:#30210c;font-weight:1000}
.demo-number-panel small{display:block;font-size:11px;color:#ffe6b3;line-height:1.5}</style>
    <div class="demo-number-panel">
      <div class="demo-number-label">${esc(t('numberLabel'))}</div>
      <div class="demo-number-row"><strong id="demoDisplayNumber">${esc(supportSettings.demo_display_number || '01790365006')}</strong><button type="button" onclick="copyDemoNumber(this)">${esc(t('copyButton'))}</button></div>
      <small>${esc(t('numberNotice'))}</small>
    </div>
    ${depositExtraCategories()}
    <div class="card coin-request-card demo-deposit-card">
      <h3>${esc(t('paymentTitle'))}</h3>
      <div class="demo-payment-methods">
        <button type="button" class="demo-payment-method" data-method="Demo bKash" aria-pressed="false" onclick="selectDemoMethod('Demo bKash')">${demoPaymentImages.bkash ? '<img src="'+esc(demoPaymentImages.bkash)+'" alt="bKash" style="width:100%;height:34px;object-fit:contain">' : esc(t('methodBkash'))} <small>${esc(t('demoBadge'))}</small></button>
        <button type="button" class="demo-payment-method" data-method="Demo Nagad" aria-pressed="false" onclick="selectDemoMethod('Demo Nagad')">${demoPaymentImages.nagad ? '<img src="'+esc(demoPaymentImages.nagad)+'" alt="Nagad" style="width:100%;height:34px;object-fit:contain">' : esc(t('methodNagad'))} <small>${esc(t('demoBadge'))}</small></button>
        <button type="button" class="demo-payment-method" data-method="Demo Rocket" aria-pressed="false" onclick="selectDemoMethod('Demo Rocket')">${demoPaymentImages.rocket ? '<img src="'+esc(demoPaymentImages.rocket)+'" alt="Rocket" style="width:100%;height:34px;object-fit:contain">' : esc(t('methodRocket'))} <small>${esc(t('demoBadge'))}</small></button>
      </div>
      <input type="hidden" id="demoPaymentMethod" value="">
      <label for="demoAmount">${esc(t('amountLabel'))}</label>
      <input id="demoAmount" class="field" type="number" min="1" step="1" inputmode="numeric" placeholder="${esc(t('amountPlaceholder'))}" oninput="syncDemoAmountInput()">
      <div class="demo-amount-buttons">
        <button type="button" class="demo-amount-button" data-amount="100" onclick="selectDemoAmount(100)">${esc(t('currencyPrefix'))}${esc(t('preset100'))}</button>
        <button type="button" class="demo-amount-button" data-amount="200" onclick="selectDemoAmount(200)">${esc(t('currencyPrefix'))}${esc(t('preset200'))}</button>
        <button type="button" class="demo-amount-button" data-amount="300" onclick="selectDemoAmount(300)">${esc(t('currencyPrefix'))}${esc(t('preset300'))}</button>
        <button type="button" class="demo-amount-button" data-amount="500" onclick="selectDemoAmount(500)">${esc(t('currencyPrefix'))}${esc(t('preset500'))}</button>
        <button type="button" class="demo-amount-button" data-amount="1000" onclick="selectDemoAmount(1000)">${esc(t('currencyPrefix'))}${esc(t('preset1000'))}</button>
      </div>
      <label for="demoReference">${esc(t('referenceLabel'))}</label>
      <input id="demoReference" class="field" type="text" maxlength="80" autocomplete="off" placeholder="${esc(t('referencePlaceholder'))}">
      <small class="muted">${esc(t('referenceHint'))}</small>
      <button class="primary" onclick="submitDemoDeposit()">${esc(t('submitButton'))}</button>
      <p id="demoDepositMsg" class="muted"></p>
    </div>
    <h3>${esc(t('historyTitle'))}</h3><div id="demoDepositHistory" class="card">${esc(t('loadingText'))}</div>
    <button class="secondary" onclick="page('member')">${esc(t('backButton'))}</button>
  </div>`);
  loadDemoDeposits();
}
function copyDemoNumber(button){
  const number=document.getElementById('demoDisplayNumber')?.textContent.trim()||'01790365006';
  const done=()=>{if(button){button.textContent=depositText('copiedButton');setTimeout(()=>{if(button.isConnected)button.textContent='Copy';},1800);}toast(depositText('copySuccess'));};
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(number).then(done).catch(()=>fallbackCopyDemoNumber(number,done));
  }else fallbackCopyDemoNumber(number,done);
}
function fallbackCopyDemoNumber(number,done){
  const field=document.createElement('textarea');
  field.value=number;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
  document.body.appendChild(field);field.select();
  try{if(document.execCommand('copy'))done();else toast('কপি করা যায়নি');}
  catch(e){toast('কপি করা যায়নি');}
  field.remove();
}

async function loadDemoDeposits(){
 const box=document.getElementById('demoDepositHistory');if(!box)return;
 try{const d=await api('/demo-deposits');box.innerHTML=(d.requests||[]).map(x=>'<div class="history-row"><span>'+esc(x.method)+' · '+esc(depositText('currencyPrefix'))+Number(x.amount)+' '+esc(depositText('historyDemoSuffix'))+'<small>'+esc(x.demo_reference)+' · '+esc(x.created_at)+'</small></span><b>'+esc(x.status==='pending'?depositText('statusPending'):x.status==='accepted'?depositText('statusAccepted'):depositText('statusCancelled'))+'</b></div>').join('')||esc(depositText('emptyHistory'));}
 catch(e){box.textContent=e.message;}
}
async function submitDemoDeposit(){
 const method=document.getElementById('demoPaymentMethod')?.value;
 const amount=Number(document.getElementById('demoAmount')?.value);
 const demo_reference=document.getElementById('demoReference')?.value.trim();
 const msg=document.getElementById('demoDepositMsg');if(!msg)return;
 if(!method){msg.textContent=depositText('chooseMethodError');return;}
 if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(amount)){msg.textContent=depositText('amountError');return;}
 if(!demo_reference){msg.textContent=depositText('referenceError');return;}
 try{const requestMethod=String(method).replace(/^Demo\s+/,'');await api('/demo-deposits',{method:requestMethod,amount,demo_reference});msg.textContent=depositText('successMessage');await loadDemoDeposits();}
 catch(e){msg.textContent=e.message;}
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
  isPlayingGame = true;
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
  else if (g.game_type === 'minigame') miniGame(g);
}

/* ==========================================
   FREE VIRTUAL-COIN MINI GAMES
========================================== */
const MINI_GAME_INFO = {
  'gold-mines':{icon:'💎',subtitle:'Find a safe gem tile',choices:[['1','1'],['2','2'],['3','3'],['4','4'],['5','5']],hint:'একটি ঘর বাছুন। মাইন এড়াতে পারলে 1.8x।'},
  'plinko':{icon:'🔴',subtitle:'Drop the ball',choices:[],hint:'বলটি নিজে থেকেই একটি মাল্টিপ্লায়ার ঘরে পড়বে।'},
  'classic-dice':{icon:'🎲',subtitle:'Predict the dice',choices:[['high','HIGH · 4–6'],['low','LOW · 1–3']],hint:'High বা Low বেছে নিন। সঠিক হলে 1.9x।'},
  'royal-coinflip':{icon:'🪙',subtitle:'Heads or Tails',choices:[['heads','HEADS'],['tails','TAILS']],hint:'এক পাশ বেছে নিন। সঠিক হলে 1.9x।'},
  'european-roulette':{icon:'🎡',subtitle:'Choose a colour',choices:[['red','RED'],['black','BLACK'],['green','GREEN · 0']],hint:'লাল/কালোতে 1.9x, সবুজ 0-তে 14x।'},
  'blackjack-21':{icon:'🂡',subtitle:'Reach 18–21',choices:[],hint:'কার্ড তুলুন। সার্ভার ফলাফল তৈরি করবে; ১৮ বা বেশি হলে 1.8x।'},
  'baccarat':{icon:'♠️',subtitle:'Player · Banker · Tie',choices:[['player','PLAYER'],['banker','BANKER'],['tie','TIE']],hint:'Player/Banker 1.95x, Tie 8x।'},
  'diamond-slots':{icon:'💎',subtitle:'Match the reels',choices:[],hint:'তিনটি রিল ঘুরবে। তিনটি এক হলে 5x, দুটি মিললে 1.5x।'},
  'fortune-wheel':{icon:'🎯',subtitle:'Spin for a multiplier',choices:[],hint:'চাকা ঘুরিয়ে 0x থেকে 10x পর্যন্ত ফল পান।'},
  'royal-keno':{icon:'👑',subtitle:'Pick a lucky number',choices:Array.from({length:10},(_,i)=>[String(i+1),String(i+1)]),hint:'১–১০ থেকে নম্বর বাছুন। মিললে 8x।'},
  'live-roulette':{icon:'🎡',subtitle:'Live Roulette Table',choices:[['red','RED'],['black','BLACK'],['green','GREEN · 0']],hint:'ডিলার-স্টাইল সিমুলেটেড রুলেট টেবিল। লাল/কালো 1.9x, সবুজ 14x।'},
  'live-blackjack':{icon:'🂡',subtitle:'Live Blackjack Table',choices:[],hint:'অ্যানিমেটেড ডিলার কার্ড খুলবে। এটি সিমুলেটেড টেবিল, আসল লাইভ ডিলার নয়।'},
  'live-baccarat':{icon:'♠️',subtitle:'Live Baccarat Table',choices:[['player','PLAYER'],['banker','BANKER'],['tie','TIE']],hint:'ডিলার-স্টাইল সিমুলেটেড Baccarat। Player/Banker 1.95x, Tie 8x।'}
};
function miniGameStage(gameId) {
  const stages = {
    'gold-mines':'<div class="mg-mines-grid">'+Array.from({length:5},(_,i)=>'<span class="mg-mine-tile" style="--i:'+i+'">?</span>').join('')+'</div>',
    'plinko':'<div class="mg-plinko"><div class="mg-plinko-pegs">'+Array.from({length:6},(_,r)=>'<div>'+Array.from({length:r+3},()=>'<i></i>').join('')+'</div>').join('')+'</div><span class="mg-plinko-ball">●</span><div class="mg-plinko-bins"><i>0.5x</i><i>1x</i><i>2x</i><i>5x</i><i>1x</i></div></div>',
    'classic-dice':'<div class="mg-dice">⚄</div>',
    'royal-coinflip':'<div class="mg-coin"><span>TK</span></div>',
    'european-roulette':'<div class="mg-roulette-wrap"><div class="mg-roulette"><span>0</span>'+Array.from({length:11},(_,i)=>'<b>'+(i+1)+'</b>').join('')+'</div><i class="mg-roulette-pointer"></i></div>',
    'blackjack-21':'<div class="mg-cards"><span>?</span><span>?</span><span>?</span></div>',
    'baccarat':'<div class="mg-baccarat"><div><small>PLAYER</small><span>?</span><span>?</span></div><div><small>BANKER</small><span>?</span><span>?</span></div></div>',
    'diamond-slots':'<div class="mg-reels"><span>💎</span><span>👑</span><span>7️⃣</span></div>',
    'fortune-wheel':'<div class="mg-wheel-wrap"><i class="mg-wheel-pointer"></i><div class="mg-wheel"><b>2x</b><b>5x</b><b>0x</b><b>3x</b><b>10x</b><b>1x</b><b>4x</b><b>0x</b></div></div>',
    'royal-keno':'<div class="mg-keno-balls">'+Array.from({length:10},(_,i)=>'<span style="--i:'+i+'">'+(i+1)+'</span>').join('')+'</div>',
    'live-roulette':'<div class="live-table-scene"><div class="live-dealer"><span>👩🏻‍💼</span><b>DEALER MAYA</b></div><div class="mg-roulette-wrap"><div class="mg-roulette"><span>0</span>'+Array.from({length:11},(_,i)=>'<b>'+(i+1)+'</b>').join('')+'</div><i class="mg-roulette-pointer"></i></div><small>SIMULATED LIVE ROULETTE</small></div>',
    'live-blackjack':'<div class="live-table-scene"><div class="live-dealer"><span>👨🏻‍💼</span><b>DEALER ALEX</b></div><div class="mg-cards"><span>?</span><span>?</span><span>?</span></div><small>SIMULATED LIVE BLACKJACK</small></div>',
    'live-baccarat':'<div class="live-table-scene"><div class="live-dealer"><span>👩🏻‍💼</span><b>DEALER LUNA</b></div><div class="mg-baccarat"><div><small>PLAYER</small><span>?</span><span>?</span></div><div><small>BANKER</small><span>?</span><span>?</span></div></div><small>SIMULATED LIVE BACCARAT</small></div>'
  };
  return '<div class="mini-stage mini-stage-'+gameId+'" id="miniStage">'+(stages[gameId]||'<div class="mg-fallback">✨</div>')+'</div>';}
function miniGame(g) {
  stopCrashMonitor();
  const info = MINI_GAME_INFO[g.id];
  if (!info) return toast('গেমটি প্রস্তুত নয়');  const buttons = info.choices.length
    ? info.choices.map(([value,label])=>'<button type="button" class="mini-choice" data-choice="'+esc(value)+'" onclick="selectMiniChoice(this)">'+esc(label)+'</button>').join('')
    : '';
  shell(`
    <div class="page mini-game-page">
      <div class="mini-game-top"><button class="secondary" onclick="home()">‹ BACK</button><b>${esc(g.name)}</b><span id="miniBalance">${Number(me.balance).toLocaleString("en-US")} Coin</span></div>
      <section class="card mini-game-board">
        <div class="mini-game-kicker">${g.id.startsWith("live-") ? "TK777 • SIMULATED LIVE TABLE" : "TK777 • FREE ARCADE"}</div>
        <h2>${esc(g.name)}</h2><p class="muted">${esc(info.subtitle)}</p>
        ${miniGameStage(g.id)}
        <div class="mini-result" id="miniResult">READY TO PLAY</div>
        <div class="mini-detail" id="miniDetail">${esc(info.hint)}</div>
        ${buttons ? '<div class="mini-choices" id="miniChoices">'+buttons+'</div>' : ''}
        <label for="miniBet">BET · VIRTUAL COIN</label>
        <input class="field" id="miniBet" type="number" min="1" max="1000000" step="1" value="10">
        <button class="primary mini-play-button" id="miniPlay" onclick="playMiniGame('${esc(g.id)}')">▶ PLAY NOW</button>
        <small class="muted">শুধু নগদমূল্যহীন Virtual Coin · কোনো বাস্তব অর্থ নয়</small>
      </section>
      <button class="secondary" onclick="home()">ফিরে যান</button>
    </div>  `);
}
function selectMiniChoice(button) {
  document.querySelectorAll('.mini-choice').forEach(x=>x.classList.remove('selected'));
  button.classList.add('selected');
}
async function playMiniGame(gameId) {
  const button = document.getElementById('miniPlay');
  const bet = Number(document.getElementById('miniBet')?.value);
  const selected = document.querySelector('.mini-choice.selected');
  const choice = selected?.dataset.choice || '';
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000) return toast('১ থেকে ১০,০০,০০০-এর মধ্যে বেট দিন');
  const info = MINI_GAME_INFO[gameId];
  if (info?.choices.length && !choice) return toast('আগে একটি অপশন বেছে নিন');
  button.disabled = true;
  button.textContent = 'ANIMATING...';
  const stage = document.getElementById('miniStage');
  if (stage) { stage.classList.remove('is-result'); stage.classList.add('is-spinning'); }
  const startedAt = Date.now();
  try {
    const r = await api('/mini-play',{gameId,betAmount:bet,choice});
    const remaining = Math.max(0,1700-(Date.now()-startedAt));
    if (remaining) await new Promise(resolve=>setTimeout(resolve,remaining));
    me.balance = r.balance;
    const bal = document.getElementById('miniBalance');
    if (bal) bal.textContent = Number(r.balance).toLocaleString('en-US')+' Coin';
    const result = document.getElementById('miniResult');
    if (result) result.textContent = r.result;
    const detail = document.getElementById('miniDetail');
    if (detail) detail.textContent = r.detail+' · '+r.multiplier+'x · পেআউট '+r.payout+' কয়েন';
    if (stage) { stage.classList.remove('is-spinning'); stage.classList.add('is-result'); }
    toast(r.payout > bet ? 'আপনি জিতেছেন!' : r.payout === bet ? 'বেট ফেরত এসেছে' : 'এই রাউন্ডে জয় হয়নি');
  } catch(e) {
    if (stage) stage.classList.remove('is-spinning');
    toast(e.message);
  } finally { button.disabled = false; button.textContent = '↻ PLAY AGAIN'; }
}
/* ==========================================
   TK777 FLIGHT GAME SCREEN
========================================== */

function aviator(g) {
  const aviatorTitle = g.name || 'Aviator';
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
        <div class="aviator-wordmark">${esc(aviatorTitle)}<span>TK777</span></div>
        <button class="aviator-menu" type="button" onclick="toast(&quot;Game menu&quot;)" aria-label="Game menu">☰</button>
        <div class="aviator-wallet"><small>VIRTUAL BALANCE</small><b id="gameBalance">${money(me.balance)}</b></div>
      </header>

      <div class="aviator-ticker">
        <span class="ticker-label">LAST</span>
        <div id="crashHistoryTicker" class="ticker-values"><i>Loading results…</i></div>
        <button class="history-more-button" type="button" onclick="toggleCrashHistory()" aria-label="Show 15 more multipliers">⋯</button>
        <div id="crashHistoryMore" class="history-more-popover" hidden></div>
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

          <div class="aviator-promo" id="aviatorPromo">
            <div class="promo-partners"><b>UFC</b><i></i><strong>${esc(aviatorTitle)}</strong></div>
            <div class="promo-official">OFFICIAL PARTNERS</div>
            <div class="promo-progress"><span></span></div>
            <div class="promo-spribe">
              <b>✺ SPRIBE</b>
              <span>Official Game <em>✓</em></span>
              <small>Since 2019</small>
            </div>
            <div class="promo-plane">✈</div>
          </div>

          <div class="crash-flew-away" aria-hidden="true">FLEW AWAY!</div>
          <div class="multiplier" id="multi">1.00x</div>
          <div class="crash-status" id="crashStatus">WAITING FOR NEXT ROUND</div>
          <div class="aviator-crowd" id="aviatorCrowd" aria-label="Animated player count">
            <span class="crowd-avatar crowd-avatar-one"><i></i></span>
            <span class="crowd-avatar crowd-avatar-two"><i></i></span>
            <span class="crowd-avatar crowd-avatar-three"><i></i></span>
            <b id="aviatorCrowdCount">1</b>
          </div>

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
            <svg class="plane user-plane" id="plane" viewBox="110 95 340 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="User-designed red aircraft"><path d="M357,187 L349,179 L312,193 L311,195 L350,203 L357,190Z M371,168 L369,169 L366,178 L364,178 L361,174 L358,174 L358,177 L364,184 L358,200 L362,198 L367,191 L372,194 L374,193 L369,185Z M403,168 L410,184 L414,182 L423,170 L422,168 L412,166 L404,166Z M405,170 L407,168 L417,168 L420,170 L408,175Z M409,194 L398,166 L389,158 L369,160 L337,169 L328,169 L318,164 L310,163 L298,167 L278,178 L271,184 L270,192 L296,195 L301,191 L344,171 L375,162 L384,162 L388,167 L401,199 L397,200 L392,198 L359,215 L344,219 L336,216 L333,213 L335,209 L329,206 L218,188 L206,188 L196,192 L192,197 L205,210 L214,206 L216,210 L213,213 L190,224 L187,228 L186,235 L212,223 L215,223 L218,228 L210,233 L211,235 L238,223 L241,224 L239,227 L183,253 L173,250 L147,230 L138,228 L122,236 L123,239 L133,234 L136,235 L126,242 L118,245 L116,251 L119,252 L130,248 L155,273 L158,273 L159,271 L139,249 L140,246 L144,245 L163,257 L174,259 L174,262 L166,265 L165,268 L169,269 L231,244 L235,244 L240,249 L246,250 L296,233 L318,223 L334,224 L329,228 L227,262 L181,274 L156,276 L149,280 L153,284 L159,284 L160,287 L164,289 L183,282 L322,243 L357,231 L381,221 L403,209 L409,201Z M216,192 L220,191 L275,201 L308,205 L329,209 L330,211 L325,216 L321,217 L226,196Z M310,173 L308,176 L291,184 L282,184 L280,182 L287,176 L298,171 L306,171Z M308,167 L314,166 L328,173 L314,181 L311,181 L310,179 L317,175 L317,172 L309,169Z" fill="#f02036" fill-rule="evenodd" stroke="#f02036" stroke-linejoin="round" stroke-width="1"/><g class="user-plane-propeller" transform="translate(427 190)"><g class="user-plane-propeller-spin"><path d="M-3,-5 C-10,-22 -8,-43 0,-57 C8,-43 10,-22 3,-5Z" fill="#f02036" stroke="#f02036" stroke-linejoin="round"/><path d="M-3,-5 C-10,-22 -8,-43 0,-57 C8,-43 10,-22 3,-5Z" transform="rotate(180)" fill="#f02036" stroke="#f02036" stroke-linejoin="round"/></g><circle cx="0" cy="0" r="4" fill="#f02036"/></g></svg>
            <div class="plane-fire"></div>
          </div>
          
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
                    <input id="crashBet${i}" type="number" min="1" max="1000000" step="1" value="10" aria-label="Bet amount" oninput="syncBetButton(${i})" onchange="syncBetButton(${i})">
                    <button type="button" onclick="adjustQuickBet(${i},1)" aria-label="Increase bet">+</button>
                  </div>
                  <div class="quick-bets">
                    ${[1,10,50,100].map(v => `<button type="button" onclick="setQuickBet(${i},${v})">${v}</button>`).join('')}
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
        <div class="aviator-footer-note">TK777 • BDT OFFICIALS GAME</div>

      </section>
    </main>
  `;

  startCrashMonitor(g.id);
}

function syncBetButton(index) {
  const input = $('#crashBet'+index);
  const btn = $('#startCrash'+index);
  if (!input || !btn) return;
  const slot = crashSlots[index];
  if (slot?.roundId && crashPhase === 'countdown') return;
  const amount = Number(input.value);
  const shown = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  btn.innerHTML = 'Bet<br><b>BDT '+shown.toFixed(2)+'</b>';
  btn.classList.remove('is-bet-cancel');
}

function setQuickBet(index, amount) {
  const input = $('#crashBet'+index);
  if (!input) return;
  input.value = String(amount);
  syncBetButton(index);
}

function adjustQuickBet(index, direction) {
  const input = $('#crashBet'+index);
  if (!input) return;
  const current = Math.max(1,Number(input.value)||1);
  const next = Math.max(1,Math.min(1000000,current + direction*10));
  input.value = String(next);
  syncBetButton(index);
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

function multiplierHistoryClass(value) {
  const n = Number(value);
  if (n >= 15) return 'history-red';
  if (n >= 10) return 'history-pink';
  if (n >= 5) return 'history-purple';
  if (n >= 2) return 'history-orange';
  return 'history-blue';
}

function updateCrashHistory(previous) {
  crashHistoryData = Array.isArray(previous) ? previous.slice(0,25) : [];
  const ticker = $('#crashHistoryTicker');
  const more = $('#crashHistoryMore');
  const renderChip = x => {
    const n = Number(x.crash_multiplier);
    return `<span class="${multiplierHistoryClass(n)}">${n.toFixed(2)}x</span>`;
  };
  if (ticker) {
    ticker.innerHTML = crashHistoryData.length
      ? crashHistoryData.slice(0,10).map(renderChip).join('')
      : '<i>No previous rounds yet</i>';
  }
  if (more) {
    const extra = crashHistoryData.slice(10,25);
    more.innerHTML = extra.length
      ? '<div class="history-more-title">PREVIOUS 15 RESULTS</div><div class="history-more-grid">'+extra.map(renderChip).join('')+'</div>'
      : '<div class="history-more-title">আরও পুরোনো রাউন্ড নেই</div>';
  }
}

function toggleCrashHistory() {
  const panel = $('#crashHistoryMore');
  const button = $('.history-more-button');
  if (!panel) return;
  const opening = panel.hidden;
  panel.hidden = !opening;
  if (button) button.classList.toggle('active',opening);
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

  if (cancel) {
    cancel.disabled = !slot.auto || slot.busy;
  }

  const canCancelBet = !!slot.roundId && crashPhase === 'countdown';
  start.disabled = slot.busy || (!canCancelBet && crashPhase !== 'countdown');
  if (canCancelBet) {
    start.innerHTML = 'Cancel';
    start.classList.add('is-bet-cancel');
  } else {
    const amount = Math.max(0,Number($('#crashBet'+i)?.value || 0));
    start.innerHTML = 'Bet<br><b>BDT '+amount.toFixed(2)+'</b>';
    start.classList.remove('is-bet-cancel');
  }

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

function updateAviatorCrowd(state) {
  const countEl = $('#aviatorCrowdCount');
  if (!countEl || !state) return;
  const sessionKey = String(state.sessionId || state.startMs || 'aviator-session');
  if (sessionKey !== aviatorCrowdSession) {
    aviatorCrowdSession = sessionKey;
    aviatorCrowdPeak = 1832 + Math.floor(Math.random() * 269);
  }
  let count = 1;
  if (state.status === 'countdown') {
    const remaining = Math.max(0, Math.min(5000, Number(state.countdownMs || 0)));
    const progress = 1 - remaining / 5000;
    count = Math.round(1 + (aviatorCrowdPeak - 1) * Math.pow(progress, 1.65));
  } else if (state.status === 'active') {
    const elapsed = Math.max(0, Date.now() - Number(state.startMs || Date.now()));
    const progress = Math.min(1, elapsed / 20000);
    count = Math.round(aviatorCrowdPeak - (aviatorCrowdPeak - 607) * progress);
  } else {
    count = Number(countEl.textContent) || 607;
  }
  countEl.textContent = count.toLocaleString('en-US');
}

async function pollCrashState() {
  if (crashPollBusy || !crashGameId) return;
  if (!$('#aviatorStage')) return;

  crashPollBusy = true;

  try {
    const requestStartedAt = Date.now();
    const state = await api('/crash/state',{
      gameId:crashGameId
    });
    const responseReceivedAt = Date.now();
    if (Number.isFinite(Number(state.serverNow))) {
      crashServerClockOffset = Number(state.serverNow) - (requestStartedAt + responseReceivedAt) / 2;
    }

    if (!$('#aviatorStage')) return;
    const multiplier = Number(state.multiplier || 1);
    const multi = $('#multi');
    const status = $('#crashStatus');
    const stage = $('#aviatorStage');
    crashPhase = state.status;
    updateAviatorCrowd(state);

    if (state.status === 'countdown') {
      const seconds = Math.max(0,Number(state.countdownMs || 0)/1000);

      stage.classList.remove('running','crashed');
      stage.classList.add('countdown');

      stopCrashVisualAnimation();
      crashVisualValue = 1;
      crashVisualStartMs = null;
      crashVisualCrashMultiplier = null;
      const resetPlane = $('#planeWrap');
      const resetGraph = $('#flightChart');
      if (resetPlane) {
        resetPlane.classList.remove('plane-hover','plane-approach','plane-crashed');
        resetPlane.style.left = '10%';        resetPlane.style.top = '70%';
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

      crashVisualCrashMultiplier = Number(state.crashMultiplier) > 1
        ? Number(state.crashMultiplier)
        : null;
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
  const elapsed = Math.max(0,Date.now()+crashServerClockOffset-crashVisualStartMs);
  const rawValue = Math.max(1,Math.exp(elapsed/12000));
  const value = crashVisualCrashMultiplier
    ? Math.min(rawValue,crashVisualCrashMultiplier)
    : rawValue;
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
    ? Math.max(0,Date.now()+crashServerClockOffset-crashVisualStartMs)
    : 0;
  const progress = crashPhase === 'active'
    ? Math.max(0,Math.min(1,elapsed/4500))
    : 0;
  const x = 35 + 530*progress;
  // Gentle vertical bob; graph endpoint receives the identical offset.
  const bob = crashPhase === 'active' ? Math.sin(elapsed/520)*7 : 0;
  const y = 405 - 260*progress + bob;
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
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const planeRect = planeSvg.getBoundingClientRect();
    const tipX = (x/1000)*stageWidth;
    const tipY = (y/440)*stageHeight;
    // Account for SVG's default xMidYMid meet letterboxing. The aircraft
    // artwork is narrower than its CSS viewport on mobile; using the raw
    // viewport width creates a visible gap at the tail.
    const svgScale = Math.min(planeRect.width/340,planeRect.height/200);
    const artworkWidth = 340*svgScale;
    const artworkHeight = 200*svgScale;
    const artworkLeft = (planeRect.width-artworkWidth)/2;
    const artworkTop = (planeRect.height-artworkHeight)/2;
    // Rearmost tail point in the supplied aircraft artwork: (116,251).
    const rearOffsetX = artworkLeft+(116-110)*svgScale-planeRect.width/2;
    const rearOffsetY = artworkTop+(251-95)*svgScale-planeRect.height/2;
    const wrapperCenterX = tipX - rearOffsetX;
    const wrapperCenterY = tipY - rearOffsetY;
    wrap.style.left = (wrapperCenterX/stageWidth*100)+'%';
    wrap.style.top = (wrapperCenterY/stageHeight*100)+'%';
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

async function cancelAuto(index) {
  const slot = crashSlots[index];
  if (!slot || slot.busy) return;

  if (slot.roundId && crashPhase === 'countdown') {
    slot.busy = true;
    updateSlotButtons(index);
    try {
      const r = await api('/crash/cancel',{ roundId:slot.roundId });
      slot.roundId = null;
      slot.status = 'cancelled';
      slot.auto = false;
      const betButton = $('#startCrash'+index);
      if (betButton) {
        betButton.classList.remove('is-bet-cancel');
        const amount = Math.max(0,Number($('#crashBet'+index)?.value || 0));
        betButton.innerHTML = 'Bet<br><b>BDT '+amount.toFixed(2)+'</b>';
      }
      if (r.balance !== undefined) {
        me.balance = r.balance;
        const bal = $('#gameBalance');
        if (bal) bal.textContent = money(me.balance);
      }
      updateSlotStatus(index,'BET CANCELLED');
      const result = $('#result'+index);
      if (result) result.textContent = 'বেট বাতিল হয়েছে';
      toast('বেট বাতিল হয়েছে');
    } catch (e) {
      toast(e.message || 'বেট বাতিল করা যায়নি');
    } finally {
      slot.busy = false;
      updateSlotButtons(index);
    }
    return;
  }

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

  if (!slot || slot.busy) return;

  if (slot.roundId && crashPhase === 'countdown') {
    await cancelAuto(index);
    return;
  }
  if (slot.roundId) return;

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

    const targetInput = $('#autoTarget'+index);
    const target = Number(targetInput?.value || 2);

    if (!Number.isFinite(target) || target < 1.01 || target > 1000) {
      throw Error('AUTO multiplier 1.01x থেকে 1000x এর মধ্যে দিন');
    }
    slot.autoTarget = target;
    slot.busy = true;
    updateSlotButtons(index);    const r = await api('/crash/start',{
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
    const errorText = String(e?.message || '');
    const displayMessage = /পর্যাপ্ত ফ্রি কয়েন নেই|insufficient.*(coin|balance)|not enough.*(coin|balance)/i.test(errorText)
      ? 'পর্যাপ্ত ব্যালেন্স নেই'
      : errorText;
    toast(displayMessage);
    if (result) result.textContent = displayMessage;
  } finally {
    slot.busy = false;
    updateSlotButtons(index);
  }
}

/* ==========================================
   CASH OUT
========================================== */

function showAviatorCashoutPopup(message) {
  const previous = document.getElementById('aviatorCashoutPopup');
  if (previous) previous.remove();
  const popup = document.createElement('div');
  popup.id = 'aviatorCashoutPopup';
  popup.className = 'aviator-cashout-popup';
  popup.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'aviator-cashout-close';
  close.setAttribute('aria-label','Close');
  close.textContent = '×';
  close.onclick = () => {
    window.clearTimeout(window.aviatorCashoutPopupTimer);
    popup.classList.add('is-hiding');
    window.setTimeout(() => popup.remove(), 180);
  };
  popup.appendChild(close);
  document.body.appendChild(popup);
  window.clearTimeout(window.aviatorCashoutPopupTimer);
  window.aviatorCashoutPopupTimer = window.setTimeout(() => {
    popup.classList.add('is-hiding');
    window.setTimeout(() => popup.remove(), 180);
  }, 2000);
}

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
      result.textContent = r.status === 'cashed_out' ? 'Cash Out সফল হয়েছে' : 'Cash Out-এর আগেই ক্র্যাশ হয়েছে।';
    }
    if (r.status === 'cashed_out') {
      showAviatorCashoutPopup(
        `${Number(r.multiplier).toFixed(2)}x  ·  WIN BDT ${payoutAmount.toFixed(2)}`
      );
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

function renderSuperAceCards(randomize = false) {
  const faces = [
    {rank:'A',symbol:'♠',kind:'ace'},
    {rank:'K',symbol:'♛',kind:'king'},
    {rank:'Q',symbol:'♛',kind:'queen'},
    {rank:'J',symbol:'♞',kind:'jack'},
    {rank:'',symbol:'♠',kind:'spade'}
  ];
  return Array.from({length:20},(_,i) => {
    const item = randomize
      ? {rank:['A','K','Q','J','10'][Math.floor(Math.random()*5)],symbol:['♠','♥','♦','♣'][Math.floor(Math.random()*4)],kind:'random'}
      : faces[i%5];
    return `<div class="sa-card sa-${item.kind}">
      ${item.rank ? `<span class="sa-rank">${item.rank}</span>` : ''}
      <span class="sa-art">${item.symbol}</span>
    </div>`;
  }).join('');
}

function superAce(g) {
  stopCrashMonitor();

  shell(`
    <div class="game-top top">
      <button class="secondary" onclick="home()">‹ BACK</button>
      <b>${esc(g.name)}</b>
      <span id="gameBalance">${money(me.balance)}</span>
    </div>
    <div class="game-screen sa-screen">
      <div class="sa-cabinet">
        <div class="sa-wood-top">
          <div class="sa-buy-bonus">BUY<br>BONUS</div>
          <div class="sa-brand">SUPER ACE</div>
          <div class="sa-multipliers">
            <span class="active">×1</span><span>×2</span><span>×3</span><span>×5</span>
          </div>
          <div class="sa-wild-note">MATCH THE CARDS • WIN BIG <span>♛ WILD</span></div>
        </div>
        <div class="sa-reel-frame">
          <div class="cards-grid sa-cards" id="cards">
            ${renderSuperAceCards()}
          </div>
        </div>
        <div class="sa-win-line"><span>WIN</span><strong id="saWin">0.000</strong></div>
        <div class="sa-controls">
          <div class="sa-control-icon">⚙</div>
          <div class="sa-bet-control">
            <label for="acebet">BET</label>
            <input id="acebet" type="number" min="1" max="1000000" step="1" value="10">
          </div>
          <button class="sa-spin" id="aceSpin" onclick="playAce('${esc(g.id)}')"><span>✦</span><small>SPIN</small></button>
          <div class="sa-control-icon sa-turbo">↻</div>
        </div>
        <div class="sa-balance-line"><span>LV 0</span> Balance <strong id="gameBalanceBottom">${money(me.balance)}</strong></div>
        <div id="result" class="sa-result">স্পিন করতে গোল্ড বাটনে চাপ দিন</div>
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

    $('#cards').innerHTML = renderSuperAceCards(true);

    $('#saWin').textContent = Number(r.payout || 0).toFixed(3);
    $('#result').textContent =
      `ফলাফল ${r.multiplier}x · পেআউট ${r.payout} ক্রেডিট · ব্যালেন্স ${money(r.balance)}`;

    $('#gameBalance').textContent = money(r.balance);
    $('#gameBalanceBottom').textContent = money(r.balance);

  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}


/* MOBILE BROWSER BACK NAVIGATION */
(function setupTk777BackNavigation() {
  const originalHome = home;
  const originalPage = page;
  const originalOpenGame = openGame;
  const originalShowAuth = showAuth;
  let routes = [{type:'home'}];
  let restoring = false;
  let firstHomeRender = true;
  let nestedNavigation = 0;

  try {
    history.replaceState({tk777App:true,tk777Index:0}, '', location.href);
  } catch (_) {}

  function pushRoute(route) {
    if (restoring || nestedNavigation) return;
    routes.push(route);
    try {
      history.pushState({tk777App:true,tk777Index:routes.length-1}, '', location.href);
    } catch (_) {}
  }

  home = function() {
    if (firstHomeRender) firstHomeRender = false;
    else pushRoute({type:'home'});
    nestedNavigation++;
    try { return originalHome.apply(this, arguments); }
    finally { nestedNavigation--; }
  };

  page = function(name) {
    pushRoute({type:'page',name});
    nestedNavigation++;
    try { return originalPage.apply(this, arguments); }
    finally { nestedNavigation--; }
  };

  openGame = function(id) {
    const game = games.find(x => x.id === id);
    if (!game) return;
    pushRoute(me ? {type:'game',id} : {type:'auth'});
    nestedNavigation++;
    try { return originalOpenGame.apply(this, arguments); }
    finally { nestedNavigation--; }
  };

  showAuth = function() {
    pushRoute({type:'auth'});
    nestedNavigation++;
    try { return originalShowAuth.apply(this, arguments); }
    finally { nestedNavigation--; }
  };

  window.addEventListener('popstate', function(event) {
    if (!routes.length) routes = [{type:'home'}];
    if (routes.length > 1) routes.pop();
    const route = routes[routes.length-1] || {type:'home'};
    restoring = true;
    try {
      if (route.type === 'page') originalPage(route.name);
      else if (route.type === 'game') originalOpenGame(route.id);
      else if (route.type === 'auth') originalShowAuth();
      else originalHome();
    } finally {
      restoring = false;
    }
    if (!event.state || !event.state.tk777App) {
      try { history.pushState({tk777App:true,tk777Index:routes.length-1}, '', location.href); } catch (_) {}
    }
  });
})();
 
/* START APPLICATION */
init();
