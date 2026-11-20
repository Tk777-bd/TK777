const $=s=>document.querySelector(s);let token=localStorage.getItem('tk777_admin_token')||'',admin=null,aviatorRefreshTimer=null;
const api=async(path,body=null,method=null)=>{const r=await fetch('/api'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function frame(content){$('#admin').innerHTML=`<div class="admin-wrap"><header class="top" style="position:static;border-radius:10px"><div class="brand">TK777 <small>ADMIN PANEL</small></div><button onclick="location.href='/'">User Site ↗</button></header>${content}</div>`}
function login(){frame(`<div class="card" style="max-width:480px;margin:40px auto"><h2>Admin Login</h2><p class="muted">প্রথমবার ADMIN_EMAIL ও ADMIN_PASSWORD Worker secrets দিয়ে bootstrap করুন।</p><form id="login"><input class="field" name="email" placeholder="Admin email" type="email" required><input class="field" name="password" placeholder="Admin password" type="password" required><input class="field" name="username" placeholder="Admin display name"><button class="primary">Secure Login / Bootstrap</button></form><div id="msg"></div></div>`);$('#login').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));const r=await api('/admin/bootstrap',d);token=r.token;localStorage.setItem('tk777_admin_token',token);admin=r.user;dashboard()}catch(err){$('#msg').textContent=err.message}}}
async function dashboard(){try{admin=(await api('/me')).user;if(admin.role!=='admin')throw Error('Admin permission নেই');const d=await api('/admin/overview');frame(`<h2>Dashboard</h2><div class="admin-grid"><div class="stat">Users<b>${d.users}</b></div><div class="stat">Games<b>${d.games}</b></div><div class="stat">Categories<b>${d.categories}</b></div><div class="stat">Rounds<b>${d.rounds}</b></div></div><div class="admin-nav"><button onclick="users()">Users & Free Credits</button><button onclick="coinRequests()">Coin Requests</button><button onclick="demoDepositRequests()">Demo Deposit Requests</button><button onclick="demoNumberSettings()">নাম্বার চেঞ্জ</button><button onclick="cats()">Categories</button><button onclick="games()">Games</button><button onclick="gameNameEdit()">গেম নাম এডিট</button><button onclick="aviatorControl()">Aviator Control</button><button onclick="banners()">Home Banners</button><button onclick="settings()">Settings</button><button onclick="logout()">Logout</button></div><div class="card"><h3>Admin Control Center</h3><p>সাইটের ক্যাটাগরি, গেম, ছবি, HTML গেম ফাইল এবং ইউজার অ্যাকাউন্ট এখান থেকে নিয়ন্ত্রণ করুন।</p></div><div id="view"></div>`)}catch(e){login()}}
async function loadAviatorControl(){
  if(!$('#aviatorCurrent'))return;
  try{
    const d=await api('/admin/aviator-control');
    const current=d.currentRound;
    $('#aviatorCurrent').textContent=current?Number(current.crashMultiplier).toFixed(2)+'x':'—';
    $('#aviatorLive').textContent=current?Number(current.multiplier).toFixed(2)+'x':'—';
    $('#aviatorPhase').textContent=current?String(current.status).toUpperCase():'—';
    $('#aviatorNext').textContent=Number(d.nextCrashMultiplier).toFixed(2)+'x';
    const input=$('#aviatorNextInput');
    if(input&&document.activeElement!==input)input.value=Number(d.nextCrashMultiplier).toFixed(2);
    $('#aviatorControlMsg').textContent='';
  }catch(e){
    const msg=$('#aviatorControlMsg');if(msg)msg.textContent=e.message;
  }
}
async function aviatorControl(){
  if(aviatorRefreshTimer){clearInterval(aviatorRefreshTimer);aviatorRefreshTimer=null;}
  $('#view').innerHTML=`<div class="card">
    <h3>Aviator Round Control</h3>
    <p class="muted">সার্ভার নিজে প্রতিটি রাউন্ডের Crash Multiplier তৈরি করে। Admin চাইলে শুধু পরবর্তী রাউন্ডের মান পরিবর্তন করতে পারবেন। চলমান রাউন্ড পরিবর্তন হবে না।</p>
    <div class="admin-grid">
      <div class="stat">বর্তমান রাউন্ডের Crash Point<b id="aviatorCurrent">লোড হচ্ছে…</b></div>
      <div class="stat">চলতি Multiplier<b id="aviatorLive">—</b></div>
      <div class="stat">পরবর্তী রাউন্ড<b id="aviatorNext">লোড হচ্ছে…</b></div>
      <div class="stat">Round Status<b id="aviatorPhase">—</b></div>
    </div>
    <form id="aviatorNextForm" style="margin-top:18px">
      <label for="aviatorNextInput">পরবর্তী রাউন্ডের Crash Multiplier (x)</label>
      <input class="field" id="aviatorNextInput" name="multiplier" type="number" min="1.01" max="1000" step="0.01" value="2.00" required>
      <button class="primary">পরবর্তী রাউন্ড সেট করুন</button>
      <button type="button" onclick="loadAviatorControl()">Refresh</button>
    </form>
    <p class="muted">সীমা: 1.01x–1000.00x। সেটিংটি পরবর্তী তৈরি হওয়া রাউন্ডে কার্যকর হবে। সব ইউজার একই সার্ভার রাউন্ড পাবেন।</p>
    <div id="aviatorControlMsg" class="muted"></div>
  </div>`;
  $('#aviatorNextForm').onsubmit=async e=>{
    e.preventDefault();
    const multiplier=Number($('#aviatorNextInput').value);
    try{
      const d=await api('/admin/aviator-control',{multiplier});
      $('#aviatorControlMsg').textContent='পরবর্তী রাউন্ড '+Number(d.nextCrashMultiplier).toFixed(2)+'x সেট হয়েছে।';
      await loadAviatorControl();
    }catch(err){$('#aviatorControlMsg').textContent=err.message;}
  };
  await loadAviatorControl();
  aviatorRefreshTimer=setInterval(()=>{if($('#aviatorCurrent'))loadAviatorControl();},2000);
}
async function users(){const d=await api('/admin/users');$('#view').innerHTML=`<div class="card"><h3>Users & Free Credits</h3><div class="table-wrap"><table><tr><th>User</th><th>Email</th><th>Free Credits</th><th>Action</th></tr>${d.users.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${u.balance}</td><td><button onclick="adjust('${u.id}')">Adjust</button></td></tr>`).join('')}</table></div></div>`}
async function adjust(id){const amount=prompt('ফ্রি ক্রেডিট যোগ করতে positive, কমাতে negative amount লিখুন');if(amount===null)return;const note=prompt('কারণ লিখুন')||'Admin adjustment';try{await api('/admin/balance',{userId:id,amount:Number(amount),note});users()}catch(e){alert(e.message)}}
async function cats(){const d=await api('/admin/categories');$('#view').innerHTML=`<div class="card"><h3>Add / Edit Category</h3><form id="cat"><input class="field" name="id" placeholder="ID (e.g. hot-games)"><input class="field" name="name" placeholder="Category name" required><input class="field" name="image_url" placeholder="Category image URL"><input class="field" name="sort_order" type="number" placeholder="Sort order"><button>Save Category</button></form></div><div class="card">${d.categories.map(c=>`<p>${esc(c.name)} · ${esc(c.image_url)} <button onclick="delCat('${c.id}')">Disable</button></p>`).join('')}</div>`;$('#cat').onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.target));try{await api('/admin/categories',x);cats()}catch(err){alert(err.message)}}}
async function delCat(id){if(confirm('Disable category?')){await api('/admin/categories/'+id,null,'DELETE');cats()}}
async function games(){
 const [d,c]=await Promise.all([api('/admin/games'),api('/admin/categories')]);
 const existing=d.games.filter(g=>['aviator','superace'].includes(g.game_type));
 $('#view').innerHTML=`<div class="card"><h3>গেমের কার্ডের ছবি পরিবর্তন</h3>
 <p class="muted">Aviator বা Super Ace নির্বাচন করে ছবির সরাসরি URL দিন। Save Game করলে ইউজার সাইটে ছবিটি দেখা যাবে।</p>
 <form id="game">
 <label>আগের গেম নির্বাচন করুন</label>
 <select class="field" id="existingGame"><option value="">নতুন গেম / নিজে ID লিখুন</option>${d.games.map(g=>`<option value="${esc(g.id)}">${esc(g.name)} · ${esc(g.game_type)}</option>`).join('')}</select>
 <input class="field" name="id" id="gameId" placeholder="Game ID (e.g. aviator)" required>
 <input class="field" name="name" id="gameName" placeholder="Game name" required>
 <select class="field" name="category_id" id="gameCategory">${c.categories.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
 <label>কার্ডের ছবির লিংক (Image URL)</label>
 <input class="field" name="image_url" id="gameImageUrl" placeholder="https://example.com/aviator-image.jpg" type="url">
 <div id="gameImagePreview" class="muted" style="margin:4px 0 12px">ছবির লিংক দিলে এখানে প্রিভিউ দেখা যাবে।</div>
 <label>Game Type</label>
 <select class="field" name="game_type" id="gameType"><option value="aviator">Aviator</option><option value="superace">Super Ace</option><option value="html">Custom HTML</option></select>
 <label>Free-play HTML game upload (optional)</label><input class="field" id="htmlfile" type="file" accept=".html,.htm,text/html">
 <textarea class="field" id="htmlsource" name="html_content" placeholder="ফ্রি-প্লে HTML গেমের সোর্স (অথবা HTML ফাইল আপলোড করুন)"></textarea>
 <input class="field" name="sort_order" id="gameSort" type="number" placeholder="Sort order">
 <button class="primary">Save Game</button></form></div>
  <div class="card"><h3>আগের গেমগুলো — Delete Control</h3><p class="muted">Delete করলে গেমটি ইউজার সাইট থেকে লুকানো হবে; পুরোনো রাউন্ড/হিস্ট্রি অক্ষত থাকবে।</p>${d.games.map(g=>`<div class="row" style="justify-content:space-between;margin:8px 0"><span>${esc(g.name)} · ${esc(g.game_type)} · ${g.active ? 'চালু' : 'মুছে রাখা'}</span><span>${g.active ? `<button type="button" onclick="editGame('${esc(g.id)}')">Edit</button> <button type="button" onclick="delGame('${esc(g.id)}')">Delete</button>` : 'Deleted'}</span></div>`).join('')}</div>`;

 const slotPosterItems=[
  ['slot-display-super-elements','Super Elements'],['slot-display-azteca-legacy','Azteca Legacy'],['slot-display-flyx','FlyX'],
  ['slot-display-magic-ace','Magic Ace'],['slot-display-circus-joker','Circus Joker'],['slot-display-fortune-gems-3','Fortune Gems 3'],
  ['slot-display-super-ace-ii','Super Ace II'],['slot-display-boxing-king','Boxing King'],['slot-display-super-ace-deluxe','Super Ace Deluxe'],
  ['slot-display-dragon-gems','Dragon Gems'],['slot-display-treasures-of-aztec','Treasures of Aztec'],['slot-display-anubis-wrath','Anubis Wrath'],
  ['slot-display-golden-empire','Golden Empire'],
  ['slot-display-money-coming','Money Coming'],
  ['slot-display-fortune-gems','Fortune Gems'],
  ['slot-display-fortune-gems-2','Fortune Gems 2'],
  ['slot-display-devil-fire-2','Devil Fire 2'],
  ['slot-display-zeus','Zeus'],
  ['slot-display-wild-ace','Wild Ace'],
  ['slot-display-golden-bank','Golden Bank'],
  ['slot-display-party-night','Party Night'],
  ['slot-display-lucky-goldbricks','Lucky Goldbricks'],
  ['slot-display-mahjong-ways','Mahjong Ways'],
  ['slot-display-mahjong-ways-2','Mahjong Ways 2'],
  ['slot-display-fortune-tiger','Fortune Tiger'],
  ['slot-display-fortune-ox','Fortune Ox'],
  ['slot-display-fortune-rabbit','Fortune Rabbit'],
  ['slot-display-lucky-neko','Lucky Neko'],
  ['slot-display-dragon-hatch','Dragon Hatch'],
  ['slot-display-ganesha-fortune','Ganesha Fortune'],
  ['slot-display-wild-bandito','Wild Bandito'],
  ['slot-display-ways-of-the-qilin','Ways of the Qilin']
 ];
 const settingData=await api('/admin/settings');
 const settingValues=Object.fromEntries((settingData.settings||[]).map(x=>[x.key,x.value]));
 let gameNameOverrides={};try{gameNameOverrides=JSON.parse(settingValues.game_name_overrides||'{}');if(!gameNameOverrides||typeof gameNameOverrides!=='object')gameNameOverrides={};}catch{gameNameOverrides={};}
 let hiddenSlotIds=[];try{hiddenSlotIds=JSON.parse(settingValues.slot_display_hidden||'[]');if(!Array.isArray(hiddenSlotIds))hiddenSlotIds=[];}catch{hiddenSlotIds=[];}
 $('#view').insertAdjacentHTML('afterbegin',`<div class="card"><h3>নতুন Slot গেমের ছবি (Image URL)</h3>
 <p class="muted">Super Ace-এর মতো প্রতিটি Slot গেমের জন্য সরাসরি HTTPS Image URL দিন। Save করলে ইউজার সাইটের গেম কার্ডে ছবিটি দেখা যাবে। খালি রাখলে নামসহ ডিফল্ট পোস্টার দেখাবে।</p>
 ${slotPosterItems.map(([id,name])=>'<div style="margin:12px 0;padding:8px;border-bottom:1px solid #ffffff22"><label>'+esc(name)+' — Image URL</label><input class="field slot-display-image-url" data-slot-id="'+id+'" type="url" maxlength="1000" placeholder="https://example.com/'+id+'.jpg" value="'+esc(settingValues['slot_display_image_'+id]||'')+'"><img class="slot-display-image-preview" data-preview-id="'+id+'" src="'+esc(settingValues['slot_display_image_'+id]||'')+'" alt="'+esc(name)+' preview" style="max-width:110px;max-height:145px;object-fit:cover;border-radius:8px;'+(settingValues['slot_display_image_'+id]?'':'display:none')+'"><button type="button" class="slot-display-toggle" data-slot-id="'+id+'">'+(hiddenSlotIds.includes(id)?'Restore to site':'Delete from site')+'</button></div>').join('')}}
 <button type="button" class="primary" id="saveSlotDisplayImages">Save Slot Images</button><div id="slotImageSaveMsg" class="muted"></div></div>`);
 document.querySelectorAll('.slot-display-toggle').forEach(button=>button.addEventListener('click',async()=>{
   const id=button.dataset.slotId;
   const next=hiddenSlotIds.includes(id)?hiddenSlotIds.filter(x=>x!==id):[...hiddenSlotIds,id];
   if(!confirm(next.includes(id)?'এই গেমটি ইউজার সাইট থেকে মুছে ফেলবেন?':'এই গেমটি আবার ইউজার সাইটে দেখাবেন?'))return;
   try{await api('/admin/settings',{key:'slot_display_hidden',value:JSON.stringify(next)});games();}
   catch(err){alert(err.message);}
 }));
 document.querySelectorAll('.slot-display-image-url').forEach(input=>input.addEventListener('input',()=>{
   const img=document.querySelector('[data-preview-id="'+input.dataset.slotId+'"]');
   img.src=input.value;img.style.display=input.value?'block':'none';
 }));
 $('#saveSlotDisplayImages').onclick=async()=>{
   const msg=$('#slotImageSaveMsg');msg.textContent='Saving…';
   try{
     for(const input of document.querySelectorAll('.slot-display-image-url')){
       const value=input.value.trim();
       if(value&&!/^https:\/\//i.test(value))throw Error( input.dataset.slotId+': HTTPS Image URL দিন');
       await api('/admin/settings',{key:'slot_display_image_'+input.dataset.slotId,value});
     }
     msg.textContent='সব Slot ছবির URL সংরক্ষণ হয়েছে। User Site রিফ্রেশ করলে ছবি দেখা যাবে।';
   }catch(err){msg.textContent=err.message;}
 };
 window.adminGameRows=d.games;
 const preview=()=>{const url=$('#gameImageUrl').value.trim(),box=$('#gameImagePreview');box.innerHTML=url?`<img src="${esc(url)}" alt="Image preview" style="max-width:100%;max-height:150px;border-radius:8px" onerror="this.outerHTML='<span class=\\'muted\\'>ছবিটি লোড করা যায়নি। URL পরীক্ষা করুন।</span>'">`:'ছবির লিংক দিলে এখানে প্রিভিউ দেখা যাবে।';};
 $('#gameImageUrl').oninput=preview;
 $('#existingGame').onchange=()=>{const g=d.games.find(x=>x.id===$('#existingGame').value);if(!g)return;$('#gameId').value=g.id;$('#gameName').value=g.name;$('#gameCategory').value=g.category_id||'';$('#gameImageUrl').value=g.image_url||'';$('#gameType').value=g.game_type;$('#gameSort').value=g.sort_order??'';preview();};
 $('#htmlfile').onchange=async e=>{const f=e.target.files[0];if(f){if(f.size>500000)return alert('HTML ফাইল সর্বোচ্চ 500KB হতে পারবে');$('#htmlsource').value=await f.text();}};
 $('#game').onsubmit=async e=>{e.preventDefault();try{await api('/admin/games',Object.fromEntries(new FormData(e.target)));alert('গেমের তথ্য ও ছবির লিংক সেভ হয়েছে');games()}catch(err){alert(err.message)}};
}
function editGame(id){const s=$('#existingGame');if(s){s.value=id;s.dispatchEvent(new Event('change'));window.scrollTo({top:0,behavior:'smooth'});}}


async function gameNameEdit(){
 const [d,s]=await Promise.all([api('/admin/games'),api('/admin/settings')]);
 const settings=Object.fromEntries((s.settings||[]).map(x=>[x.key,x.value]));
 let overrides={};
 try{overrides=JSON.parse(settings.game_name_overrides||'{}');if(!overrides||typeof overrides!=='object')overrides={};}catch{overrides={};}
 const slotItems=[
  ['slot-display-super-elements','Super Elements'],['slot-display-azteca-legacy','Azteca Legacy'],['slot-display-flyx','FlyX'],
  ['slot-display-magic-ace','Magic Ace'],['slot-display-circus-joker','Circus Joker'],['slot-display-fortune-gems-3','Fortune Gems 3'],
  ['slot-display-super-ace-ii','Super Ace II'],['slot-display-boxing-king','Boxing King'],['slot-display-super-ace-deluxe','Super Ace Deluxe'],
  ['slot-display-dragon-gems','Dragon Gems'],['slot-display-treasures-of-aztec','Treasures of Aztec'],['slot-display-anubis-wrath','Anubis Wrath'],
  ['slot-display-golden-empire','Golden Empire'],['slot-display-money-coming','Money Coming'],['slot-display-fortune-gems','Fortune Gems'],
  ['slot-display-fortune-gems-2','Fortune Gems 2'],['slot-display-devil-fire-2','Devil Fire 2'],['slot-display-zeus','Zeus'],
  ['slot-display-wild-ace','Wild Ace'],['slot-display-golden-bank','Golden Bank'],['slot-display-party-night','Party Night'],
  ['slot-display-lucky-goldbricks','Lucky Goldbricks'],['slot-display-mahjong-ways','Mahjong Ways'],['slot-display-mahjong-ways-2','Mahjong Ways 2'],
  ['slot-display-fortune-tiger','Fortune Tiger'],['slot-display-fortune-ox','Fortune Ox'],['slot-display-fortune-rabbit','Fortune Rabbit'],
  ['slot-display-lucky-neko','Lucky Neko'],['slot-display-dragon-hatch','Dragon Hatch'],['slot-display-ganesha-fortune','Ganesha Fortune'],
  ['slot-display-wild-bandito','Wild Bandito'],['slot-display-ways-of-the-qilin','Ways of the Qilin']
 ];
 const rows=d.games.map(g=>({id:g.id,name:g.name,group:'গেম'})).concat(slotItems.map(([id,name])=>({id,name:overrides[id]||name,group:'Slot'})));
 $('#view').innerHTML='<div class="card"><h3>গেম নাম এডিট</h3><p class="muted">এখান থেকে প্রতিটি গেমের নাম পরিবর্তন করে Save Name চাপুন। পরিবর্তিত নাম User Site-এও দেখা যাবে। গেমের ID, ডিজাইন ও পুরোনো হিস্ট্রি অপরিবর্তিত থাকবে।</p>'+rows.map(g=>'<div class="row" style="gap:8px;align-items:center;margin:8px 0"><span style="width:54px;flex-shrink:0">'+esc(g.group)+'</span><input class="field game-name-edit" data-game-id="'+esc(g.id)+'" value="'+esc(g.name)+'" maxlength="80" style="flex:1;min-width:0"><button type="button" onclick="saveGameName(\''+esc(g.id)+'\')">Save Name</button></div>').join('')+'</div>';
}

async function saveGameName(id){
 const input=Array.from(document.querySelectorAll('.game-name-edit')).find(x=>x.dataset.gameId===id);
 const name=(input?.value||'').trim();
 if(!name)return alert('গেমের নাম লিখুন');
 try{await api('/admin/game-name',{id,name});alert('গেমের নাম পরিবর্তন হয়েছে');games();}
 catch(e){alert(e.message);}
}

async function delGame(id){if(confirm('এই গেমটি ইউজার সাইট থেকে মুছে ফেলবেন? পুরোনো হিস্ট্রি অক্ষত থাকবে।')){try{await api('/admin/games/'+id,null,'DELETE');games()}catch(e){alert(e.message)}}}

async function banners(){
 const d=await api('/admin/settings');
 const values=Object.fromEntries(d.settings.map(x=>[x.key,x.value]));
 $('#view').innerHTML='<div class="card"><h3>Home Banners (সর্বোচ্চ ৫টি)</h3><p class="muted">প্রতিটি ঘরে HTTPS Image URL দিন। খালি রাখলে সেই ব্যানার মুছে যাবে।</p>'+[1,2,3,4,5].map(i=>'<div class="banner-admin-row"><label>Banner '+i+' Image URL</label><input class="field" id="homeBanner'+i+'" type="url" maxlength="1000" placeholder="https://example.com/banner.jpg" value="'+esc(values['home_banner_'+i]||'')+'"><img id="homeBannerPreview'+i+'" class="banner-admin-preview" src="'+esc(values['home_banner_'+i]||'')+'" '+(values['home_banner_'+i]?'':'hidden')+'></div>').join('')+'<button class="primary" onclick="saveHomeBanners()">Save Banners</button><div id="bannerSaveMsg" class="muted"></div></div>';
 [1,2,3,4,5].forEach(i=>{const input=$('#homeBanner'+i),img=$('#homeBannerPreview'+i);input.addEventListener('input',()=>{img.src=input.value;img.hidden=!input.value;});});
}
async function saveHomeBanners(){
 const msg=$('#bannerSaveMsg');msg.textContent='Saving…';
 try{for(let i=1;i<=5;i++){const value=$('#homeBanner'+i).value.trim();if(value&&!/^https:\/\//i.test(value))throw Error('Banner '+i+': HTTPS Image URL দিন');await api('/admin/settings',{key:'home_banner_'+i,value});}msg.textContent='ব্যানার সংরক্ষণ হয়েছে।';}catch(e){msg.textContent=e.message;}
}



async function demoDepositRequests(){
 const d=await api('/admin/demo-deposits');
 $('#view').innerHTML=`<div class="card"><h3>Demo Deposit Requests</h3><p class="muted">এগুলো কাল্পনিক পরীক্ষামূলক রেকর্ড। কোনো টাকা যাচাই বা কয়েন যোগ হয় না।</p><div id="demoDepositAdminList"></div></div>`;
 renderDemoDepositRequests(d.requests||[]);
}
function renderDemoDepositRequests(rows){
 const box=$('#demoDepositAdminList');if(!box)return;
 box.innerHTML=rows.map(x=>`<div class="card"><b>${esc(x.username||x.email||'User')}</b><p>${esc(x.method)} · ৳${Number(x.amount)} (Demo)</p><p>Reference: ${esc(x.demo_reference)}</p><p>Status: ${esc(x.status==='accepted'?'Accepted':x.status==='cancelled'?'Cancelled':'Pending')} · ${esc(x.created_at)}</p>${x.status==='pending'?'<button class="primary" onclick="reviewDemoDeposit(\''+esc(x.id)+'\',\'accepted\')">Accept</button> <button onclick="reviewDemoDeposit(\''+esc(x.id)+'\',\'cancelled\')">Cancel</button> ':''}<button onclick="deleteDemoDeposit('${esc(x.id)}')">Delete Demo Record</button></div>`).join('')||'কোনো Demo Request নেই';
}
async function reviewDemoDeposit(id,status){const label=status==='accepted'?'Accept':'Cancel';if(!confirm('এই Demo Request '+label+' করবেন?'))return;try{await api('/admin/demo-deposits/review',{id,status});await demoDepositRequests();}catch(e){alert(e.message);}}
async function deleteDemoDeposit(id){if(!confirm('এই Demo Record মুছে ফেলবেন?'))return;try{await api('/admin/demo-deposits/'+encodeURIComponent(id),null,'DELETE');await demoDepositRequests();}catch(e){alert(e.message);}}

async function coinRequests(){
 const d=await api('/admin/coin-requests');
 $('#view').innerHTML=`<div class="card"><h3>Free Virtual Coin Requests</h3><p class="muted">Approve করলে তবেই ইউজারের ব্যালেন্সে নগদমূল্যহীন Virtual Coin যোগ হবে।</p><label>মোবাইল নম্বর দিয়ে খুঁজুন</label><input class="field" id="coinSearch" placeholder="মোবাইল নম্বর" oninput="searchCoinRequests()"><div id="coinRequestAdminList"></div></div>`;
 renderCoinRequests(d.requests||[]);
}
function renderCoinRequests(rows){
 const box=$('#coinRequestAdminList');if(!box)return;
 box.innerHTML=rows.map(x=>`<div class="card"><b>${esc(x.username||x.email)}</b><p>${esc(x.email)} • ${Number(x.amount)} Virtual Coin</p><p>Status: ${esc(x.status)} • ${esc(x.created_at)}</p>${x.status==='pending'?'<button class="primary" onclick="reviewCoinRequest(\''+esc(x.id)+'\',\'approved\')">Accept</button> <button onclick="reviewCoinRequest(\''+esc(x.id)+'\',\'rejected\')">Reject</button>':''}</div>`).join('')||'কোনো Request নেই';
}
async function searchCoinRequests(){const q=$('#coinSearch').value;const d=await api('/admin/coin-requests?q='+encodeURIComponent(q));renderCoinRequests(d.requests||[]);}
async function reviewCoinRequest(id,status){try{await api('/admin/coin-requests/review',{id,status});await searchCoinRequests();}catch(e){alert(e.message);}}

async function demoNumberSettings(){
 const d=await api('/admin/settings');
 const values=Object.fromEntries((d.settings||[]).map(s=>[s.key,s.value]));
 const current=values.demo_display_number||'01790365006';
 $('#view').innerHTML='<div class="card"><h3>Demo Number পরিবর্তন</h3><p class="muted">এখানে দেওয়া নম্বরটি শুধু Demo Deposit পেজে প্রদর্শিত হবে এবং Copy করা যাবে। এটি কোনো পেমেন্ট নম্বর নয়। কোনো টাকা পাঠানো বা কয়েন যোগ করার কাজে ব্যবহার হবে না।</p><label>Demo Display Number</label><input class="field" id="demoDisplayNumberInput" type="tel" inputmode="numeric" maxlength="11" value="'+esc(current)+'" placeholder="01XXXXXXXXX"><button class="primary" onclick="saveDemoDisplayNumber()">Save Number</button><div id="demoDisplayNumberMsg" class="muted"></div></div>';
}
async function saveDemoDisplayNumber(){
 const input=$('#demoDisplayNumberInput');
 const msg=$('#demoDisplayNumberMsg');
 const value=input.value.trim();
 if(!/^01[3-9][0-9]{8}$/.test(value)){msg.textContent='সঠিক ১১ সংখ্যার Demo নম্বর দিন (01 দিয়ে শুরু)।';return;}
 try{await api('/admin/settings',{key:'demo_display_number',value});msg.textContent='Demo নম্বর সংরক্ষণ হয়েছে।';}
 catch(e){msg.textContent=e.message;}
}

async function settings(){
 const d=await api('/admin/settings');
 const values=Object.fromEntries(d.settings.map(s=>[s.key,s.value]));
 const imageRows=[['bkash','bKash'],['nagad','Nagad'],['rocket','Rocket']];
 let imageHtml='';
 for(const item of imageRows){const id=item[0],label=item[1],value=values['demo_payment_image_'+id]||'';imageHtml+='<div><label>'+label+' Image URL</label><input class="field" type="url" id="demoPayImg-'+id+'" maxlength="1000" placeholder="https://example.com/'+id+'.png" value="'+esc(value)+'"><img id="demoPayPreview-'+id+'" src="'+esc(value)+'" style="max-width:150px;max-height:55px;object-fit:contain;margin:8px 0" '+(value?'':'hidden')+'></div>';}
 $('#view').innerHTML='<div class="card"><h3>Demo Deposit Button Images</h3><p class="muted">ইউজার সাইটের Demo Deposit পেজে bKash, Nagad ও Rocket বাটনের ছবির HTTPS URL দিন। খালি রাখলে আগের নাম দেখাবে।</p>'+imageHtml+'<button class="primary" onclick="saveDemoPaymentImages()">Save Demo Button Images</button><div id="demoPayImageMsg" class="muted"></div></div>'+
 '<div class="card"><h3>Telegram Support Button</h3><p class="muted">ইউজার সাইটের ডান পাশে ছোট গোল Telegram বাটন দেখাবে। গেমের ভেতরে এটি লুকানো থাকবে।</p><label>Telegram Username (@ ছাড়া)</label><input class="field" id="supportTelegramUsername" maxlength="80" placeholder="your_username" value="'+esc(values.support_telegram_username||'')+'"><label>বাটনের ছবির HTTPS URL (ঐচ্ছিক)</label><input class="field" id="supportTelegramImage" type="url" maxlength="1000" placeholder="https://example.com/support.png" value="'+esc(values.support_telegram_image_url||'')+'"><button class="primary" onclick="saveSupportSettings()">Save Telegram Support</button><div id="supportSaveMsg" class="muted"></div></div>'+
 '<div class="card"><h3>Site Settings</h3>'+d.settings.filter(s=>!['support_telegram_username','support_telegram_image_url','demo_payment_image_bkash','demo_payment_image_nagad','demo_payment_image_rocket','demo_display_number'].includes(s.key)).map(s=>'<div><label>'+esc(s.key)+'</label><input class="field" id="set-'+esc(s.key)+'" value="'+esc(s.value)+'"><button onclick="saveSetting(\''+esc(s.key)+'\')">Save</button></div>').join('')+'<p class="muted">Settings values are stored in D1.</p></div>';
 for(const item of imageRows){const id=item[0],input=$('#demoPayImg-'+id),img=$('#demoPayPreview-'+id);input.addEventListener('input',()=>{img.src=input.value;img.hidden=!input.value;});}
}
async function saveDemoPaymentImages(){
 const msg=$('#demoPayImageMsg');
 try{for(const id of ['bkash','nagad','rocket']){const value=$('#demoPayImg-'+id).value.trim();if(value&&!/^https:\/\//i.test(value))throw Error(id+' image URL অবশ্যই HTTPS হতে হবে');await api('/admin/settings',{key:'demo_payment_image_'+id,value});}msg.textContent='তিনটি Demo বাটনের Image URL সংরক্ষণ হয়েছে।';}
 catch(e){msg.textContent=e.message;}
}
async function saveSupportSettings(){const username=$('#supportTelegramUsername').value.trim().replace(/^@/,'');const image=$('#supportTelegramImage').value.trim();const msg=$('#supportSaveMsg');if(username&&!/^[A-Za-z0-9_]{5,32}$/.test(username)){msg.textContent='সঠিক Telegram username দিন (@ ছাড়া)।';return;}if(image&&!/^https:\/\//i.test(image)){msg.textContent='ছবির URL অবশ্যই HTTPS হতে হবে।';return;}try{await api('/admin/settings',{key:'support_telegram_username',value:username});await api('/admin/settings',{key:'support_telegram_image_url',value:image});msg.textContent='Telegram Support সেটিংস সংরক্ষণ হয়েছে।';}catch(e){msg.textContent=e.message;}}
async function saveSetting(key){await api('/admin/settings',{key,value:$('#set-'+key).value});alert('Saved')}
function logout(){localStorage.removeItem('tk777_admin_token');token='';login()}
dashboard();