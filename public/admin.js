const $=s=>document.querySelector(s);let token=localStorage.getItem('tk777_admin_token')||'',admin=null,aviatorRefreshTimer=null;
const api=async(path,body=null,method=null)=>{const r=await fetch('/api'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function frame(content){$('#admin').innerHTML=`<div class="admin-wrap"><header class="top" style="position:static;border-radius:10px"><div class="brand">TK777 <small>ADMIN PANEL</small></div><button onclick="location.href='/'">User Site ↗</button></header>${content}</div>`}
function login(){frame(`<div class="card" style="max-width:480px;margin:40px auto"><h2>Admin Login</h2><p class="muted">প্রথমবার ADMIN_EMAIL ও ADMIN_PASSWORD Worker secrets দিয়ে bootstrap করুন।</p><form id="login"><input class="field" name="email" placeholder="Admin email" type="email" required><input class="field" name="password" placeholder="Admin password" type="password" required><input class="field" name="username" placeholder="Admin display name"><button class="primary">Secure Login / Bootstrap</button></form><div id="msg"></div></div>`);$('#login').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));const r=await api('/admin/bootstrap',d);token=r.token;localStorage.setItem('tk777_admin_token',token);admin=r.user;dashboard()}catch(err){$('#msg').textContent=err.message}}}
async function dashboard(){try{admin=(await api('/me')).user;if(admin.role!=='admin')throw Error('Admin permission নেই');const d=await api('/admin/overview');frame(`<h2>Dashboard</h2><div class="admin-grid"><div class="stat">Users<b>${d.users}</b></div><div class="stat">Games<b>${d.games}</b></div><div class="stat">Categories<b>${d.categories}</b></div><div class="stat">Rounds<b>${d.rounds}</b></div></div><div class="admin-nav"><button onclick="users()">Users & Free Credits</button><button onclick="cats()">Categories</button><button onclick="games()">Games</button><button onclick="aviatorControl()">Aviator Control</button><button onclick="settings()">Settings</button><button onclick="logout()">Logout</button></div><div class="card"><h3>Admin Control Center</h3><p>সাইটের ক্যাটাগরি, গেম, ছবি, HTML গেম ফাইল এবং ইউজার অ্যাকাউন্ট এখান থেকে নিয়ন্ত্রণ করুন।</p></div><div id="view"></div>`)}catch(e){login()}}
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
async function games(){const [d,c]=await Promise.all([api('/admin/games'),api('/admin/categories')]);$('#view').innerHTML=`<div class="card"><h3>Add / Edit Game</h3><form id="game"><input class="field" name="id" placeholder="Game ID (e.g. my-game)"><input class="field" name="name" placeholder="Game name" required><select class="field" name="category_id">${c.categories.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><input class="field" name="image_url" placeholder="Game image URL"><select class="field" name="game_type"><option value="aviator">Aviator-style demo</option><option value="superace">Super Ace-style demo</option><option value="html">Custom HTML (sandboxed / informational)</option></select><label>Free-play HTML game upload (optional)</label><input class="field" id="htmlfile" type="file" accept=".html,.htm,text/html"><textarea class="field" id="htmlsource" name="html_content" placeholder="ফ্রি-প্লে HTML গেমের সোর্স (অথবা HTML ফাইল আপলোড করুন)"></textarea><input class="field" name="sort_order" type="number" placeholder="Sort order"><button>Save Game</button></form></div><div class="card">${d.games.map(g=>`<p>${esc(g.name)} · ${esc(g.game_type)} <button onclick="delGame('${g.id}')">Disable</button></p>`).join('')}</div>`;$('#htmlfile').onchange=async e=>{const f=e.target.files[0];if(f){if(f.size>500000) return alert('HTML ফাইল সর্বোচ্চ 500KB হতে পারবে');$('#htmlsource').value=await f.text();}};$('#game').onsubmit=async e=>{e.preventDefault();try{await api('/admin/games',Object.fromEntries(new FormData(e.target)));games()}catch(err){alert(err.message)}}}
async function delGame(id){if(confirm('Disable game?')){await api('/admin/games/'+id,null,'DELETE');games()}}
async function settings(){const d=await api('/admin/settings');$('#view').innerHTML=`<div class="card"><h3>Site Settings</h3>${d.settings.map(s=>`<div><label>${esc(s.key)}</label><input class="field" id="set-${esc(s.key)}" value="${esc(s.value)}"><button onclick="saveSetting('${esc(s.key)}')">Save</button></div>`).join('')}<p class="muted">Settings values are stored in D1.</p></div>`}
async function saveSetting(key){await api('/admin/settings',{key,value:$('#set-'+key).value});alert('Saved')}
function logout(){localStorage.removeItem('tk777_admin_token');token='';login()}
dashboard();