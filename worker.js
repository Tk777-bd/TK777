const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{...cors,"Content-Type":"application/json"}});
const uid = () => crypto.randomUUID();
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const enc = new TextEncoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
async function hash(s) {
  const d=await crypto.subtle.digest("SHA-256",enc.encode(s));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function passHash(password,salt) {
  const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:120000,hash:"SHA-256"},key,256);
  return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function currentUser(req,env) {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
  if(!token) return null;
  return await env.DB.prepare("SELECT u.id,u.username,u.email,u.role,u.balance FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hash(token),Date.now()).first() || null;
}
async function requireAdmin(req,env) {
  const u=await currentUser(req,env);
  return u && u.role==="admin" ? u : null;
}
async function route(req,env) {
  const url=new URL(req.url), p=url.pathname, method=req.method;
  if(method==="OPTIONS") return new Response(null,{headers:cors});
  if(p==="/api/health") return json({ok:true,site:"TK777"});
  if(p==="/api/register" && method==="POST") {
    const body=await req.json();
    const username=String(body.username||'').trim(), email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
    if(username.length<2||username.length>40||!/^\S+@\S+\.\S+$/.test(email)||email.length>190||password.length<8||password.length>128) return json({error:"সঠিক নাম, ইমেইল এবং ৮–১২৮ অক্ষরের পাসওয়ার্ড দিন"},400);
    const id=uid(),salt=uid(),ph=await passHash(password,salt);
    try {
      await env.DB.prepare("INSERT INTO users(id,username,email,password_hash,password_salt,balance) VALUES(?,?,?,?,?,0)").bind(id,username,email,ph,salt).run();
      return await loginUser(id,env);
    } catch(e) { return json({error:"এই ইউজারনেম বা ইমেইল আগে ব্যবহার হয়েছে"},409); }
  }
  if(p==="/api/login" && method==="POST") {
    const {email,password}=await req.json();
    const u=await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(String(email||"").trim().toLowerCase()).first();
    if(!u || typeof password!=="string" || password.length>128 || await passHash(password,u.password_salt)!==u.password_hash) return json({error:"লগইন তথ্য সঠিক নয়"},401);
    return await loginUser(u.id,env);
  }
  if(p==="/api/admin/bootstrap" && method==="POST") {
    if(!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return json({error:"Admin secrets configure করা হয়নি"},400);
    const {email,password,username}=await req.json();
    if(String(email||"").toLowerCase()!==String(env.ADMIN_EMAIL).toLowerCase() || password!==env.ADMIN_PASSWORD) return json({error:"অনুমোদন হয়নি"},403);
    let u=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(String(env.ADMIN_EMAIL).toLowerCase()).first();
    if(!u) {
      const id=uid(),salt=uid(),ph=await passHash(password,salt);
      await env.DB.prepare("INSERT INTO users(id,username,email,password_hash,password_salt,balance,role) VALUES(?,?,?,?,?,0,'admin')").bind(id,username||"Administrator",String(env.ADMIN_EMAIL).toLowerCase(),ph,salt).run();
      u={id};
    } else await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(u.id).run();
    return await loginUser(u.id,env);
  }
  if(p.startsWith("/api/")) {
    const user=await currentUser(req,env);
    const admin=()=>requireAdmin(req,env);
    if(p==="/api/me") return user?json({user}):json({error:"লগইন করুন"},401);
    if(p==="/api/logout" && method==="POST") {
      const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
      if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hash(token)).run();
      return json({ok:true});
    }
    if(p==="/api/categories" && method==="GET") {
      const rows=await env.DB.prepare("SELECT * FROM categories WHERE active=1 ORDER BY sort_order").all();
      return json({categories:rows.results});
    }
    if(p==="/api/games" && method==="GET") {
      const rows=await env.DB.prepare("SELECT id,name,category_id,image_url,game_type,html_content,active,sort_order FROM games WHERE active=1 ORDER BY sort_order").all();
      return json({games:rows.results});
    }
    if(!user) return json({error:"লগইন করুন"},401);
    if(p==="/api/history") {
      const rows=await env.DB.prepare("SELECT type,amount,balance_after,note,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
      const rounds=await env.DB.prepare("SELECT game_id,bet_amount,multiplier,payout,created_at FROM game_rounds WHERE user_id=? ORDER BY created_at DESC LIMIT 30").bind(user.id).all();
      return json({transactions:rows.results,rounds:rounds.results});
    }
    if(p==="/api/play" && method==="POST") {
      const {gameId,betAmount}=await req.json();
      const bet=Number(betAmount);
      if(!Number.isSafeInteger(bet)||bet<1||bet>1000000) return json({error:"বেটের পরিমাণ ১ থেকে ১০,০০,০০০ ফ্রি ক্রেডিটের মধ্যে দিন"},400);
      const game=await env.DB.prepare("SELECT * FROM games WHERE id=? AND active=1").bind(gameId).first();
      if(!game || game.game_type!=="superace") return json({error:"এই গেমের ধরন সঠিক নয়"},404);
      const r=rand();
      const multiplier=Number((r<0.45?0:r<0.78?0.5:r<0.95?1.5:3).toFixed(2));
      const payout=Math.floor(bet*multiplier);
      const roundId=uid(), debit=await env.DB.prepare("UPDATE users SET balance=balance-? WHERE id=? AND balance>=?").bind(bet,user.id,bet).run();
      if(!debit.meta.changes) return json({error:"পর্যাপ্ত ফ্রি ক্রেডিট নেই"},400);
      try {
        if(payout) await env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=?").bind(payout,user.id).run();
        const bal=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) VALUES(?,?,?,?,?,?,?)").bind(roundId,user.id,gameId,"superace",bet,multiplier,payout),
          env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) VALUES(?,?,?,?,?,?)").bind(uid(),user.id,"game",-bet,bal.balance-payout,game.name+" বেট"),
          ...(payout?[env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) VALUES(?,?,?,?,?,?)").bind(uid(),user.id,"win",payout,bal.balance,game.name+" জয়")]:[])
        ]);
        return json({multiplier,payout,balance:bal.balance,roundId});
      } catch(e) {
        await env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=?").bind(bet-payout,user.id).run();
        throw e;
      }
    }
    if(p==="/api/crash/start" && method==="POST") {
      const {gameId,betAmount}=await req.json(),bet=Number(betAmount);
      if(!Number.isSafeInteger(bet)||bet<1||bet>1000000) return json({error:"বেট ১ থেকে ১০,০০,০০০ ফ্রি ক্রেডিটের মধ্যে দিন"},400);
      const game=await env.DB.prepare("SELECT id,name FROM games WHERE id=? AND active=1 AND game_type='aviator'").bind(gameId).first();
      if(!game) return json({error:"Crash গেম পাওয়া যায়নি"},404);
      const active=await env.DB.prepare("SELECT id,crash_multiplier,start_ms FROM crash_rounds WHERE user_id=? AND status='active'").bind(user.id).first();
      if(active) {
        const elapsed=Math.max(0,Date.now()-active.start_ms);
        if(Math.exp(elapsed/12000)>=active.crash_multiplier) {
          const ended=await env.DB.prepare("UPDATE crash_rounds SET status='crashed' WHERE id=? AND status='active'").bind(active.id).run();
          if(ended.meta.changes) {
            const old=await env.DB.prepare("SELECT game_id,bet_amount,crash_multiplier FROM crash_rounds WHERE id=?").bind(active.id).first();
            await env.DB.prepare("INSERT OR IGNORE INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) VALUES(?,?,?,?,?,?,0)").bind(active.id,user.id,old.game_id,"aviator",old.bet_amount,old.crash_multiplier).run();
          }
        } else return json({error:"আপনার একটি রাউন্ড এখনো চলছে"},409);
      }
      const crash=Number((1.05+Math.pow(rand(),2.2)*8.95).toFixed(2));
      const roundId=uid();
      const debit=await env.DB.prepare("UPDATE users SET balance=balance-? WHERE id=? AND balance>=?").bind(bet,user.id,bet).run();
      if(!debit.meta.changes) return json({error:"পর্যাপ্ত ফ্রি ক্রেডিট নেই"},400);
      try {
        await env.DB.prepare("INSERT INTO crash_rounds(id,user_id,game_id,bet_amount,crash_multiplier,start_ms,status) VALUES(?,?,?,?,?,?, 'active')").bind(roundId,user.id,gameId,bet,crash,Date.now()).run();
        const bal=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
        await env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) VALUES(?,?,?,?,?,?)").bind(uid(),user.id,"game",-bet,bal.balance,game.name+" বেট").run();
        return json({roundId,balance:bal.balance});
      } catch(e) {
        await env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=?").bind(bet,user.id).run();
        throw e;
      }
    }
    if(p==="/api/crash/tick" && method==="POST") {
      const {roundId}=await req.json();
      const round=await env.DB.prepare("SELECT * FROM crash_rounds WHERE id=? AND user_id=?").bind(roundId,user.id).first();
      if(!round) return json({error:"রাউন্ড পাওয়া যায়নি"},404);
      if(round.status!=="active") return json({status:round.status,balance:(await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first()).balance,payout:round.payout||0,multiplier:round.cashout_multiplier||round.crash_multiplier});
      const elapsed=Math.max(0,Date.now()-round.start_ms);
      const current=Number(Math.exp(elapsed/12000).toFixed(2));
      if(current>=round.crash_multiplier) {
        const ended=await env.DB.prepare("UPDATE crash_rounds SET status='crashed' WHERE id=? AND status='active'").bind(roundId).run();
        if(ended.meta.changes) await env.DB.prepare("INSERT OR IGNORE INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) VALUES(?,?,?,?,?,?,0)").bind(roundId,user.id,round.game_id,"aviator",round.bet_amount,round.crash_multiplier).run();
        const bal=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
        return json({status:"crashed",multiplier:round.crash_multiplier,balance:bal.balance,payout:0});
      }
      return json({status:"active",multiplier:current,balance:user.balance});
    }
    if(p==="/api/crash/cashout" && method==="POST") {
      const {roundId}=await req.json();
      const round=await env.DB.prepare("SELECT * FROM crash_rounds WHERE id=? AND user_id=?").bind(roundId,user.id).first();
      if(!round) return json({error:"রাউন্ড পাওয়া যায়নি"},404);
      if(round.status!=="active") return json({status:round.status,balance:(await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first()).balance,payout:round.payout||0,multiplier:round.cashout_multiplier||round.crash_multiplier});
      const current=Number(Math.exp(Math.max(0,Date.now()-round.start_ms)/12000).toFixed(2));
      if(current>=round.crash_multiplier) {
        const ended=await env.DB.prepare("UPDATE crash_rounds SET status='crashed' WHERE id=? AND status='active'").bind(roundId).run();
        if(ended.meta.changes) await env.DB.prepare("INSERT OR IGNORE INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) VALUES(?,?,?,?,?,?,0)").bind(roundId,user.id,round.game_id,"aviator",round.bet_amount,round.crash_multiplier).run();
        const bal=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
        return json({status:"crashed",multiplier:round.crash_multiplier,balance:bal.balance,payout:0});
      }
      const payout=Math.floor(round.bet_amount*current), transactionId=uid();
      // D1 batch is transactional. The settled flag makes payout crediting idempotent:
      // simultaneous/repeated Cash Out requests can only credit a round once.
      const settled=await env.DB.batch([
        env.DB.prepare("UPDATE crash_rounds SET status='cashed_out',cashout_multiplier=?,payout=? WHERE id=? AND user_id=? AND status='active' AND crash_multiplier>?").bind(current,payout,roundId,user.id,current),
        env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=? AND EXISTS(SELECT 1 FROM crash_rounds WHERE id=? AND status='cashed_out' AND settled=0)").bind(payout,user.id,roundId),
        env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) SELECT ?,?,?,?,balance,? FROM users WHERE id=? AND EXISTS(SELECT 1 FROM crash_rounds WHERE id=? AND status='cashed_out' AND settled=0)").bind(transactionId,user.id,"win",payout,"Crash গেমে Cash Out",user.id,roundId),
        env.DB.prepare("INSERT INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crash_rounds WHERE id=? AND status='cashed_out' AND settled=0)").bind(roundId,user.id,round.game_id,"aviator",round.bet_amount,current,payout,roundId),
        env.DB.prepare("UPDATE crash_rounds SET settled=1 WHERE id=? AND status='cashed_out' AND settled=0").bind(roundId)
      ]);
      if(!settled[0].meta.changes) {
        const latest=await env.DB.prepare("SELECT * FROM crash_rounds WHERE id=? AND user_id=?").bind(roundId,user.id).first();
        if(latest && latest.status==="active") {
          const crashed=await env.DB.prepare("UPDATE crash_rounds SET status='crashed' WHERE id=? AND status='active' AND crash_multiplier<=?").bind(roundId,current).run();
          if(crashed.meta.changes) await env.DB.prepare("INSERT OR IGNORE INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) VALUES(?,?,?,?,?,?,0)").bind(roundId,user.id,round.game_id,"aviator",round.bet_amount,latest.crash_multiplier).run();
        }
        const finalRound=await env.DB.prepare("SELECT status,crash_multiplier,cashout_multiplier,payout FROM crash_rounds WHERE id=?").bind(roundId).first();
        const bal=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
        return json({status:finalRound.status,multiplier:finalRound.cashout_multiplier||finalRound.crash_multiplier,payout:finalRound.payout||0,balance:bal.balance});
      }
      const bal=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
      return json({status:"cashed_out",multiplier:current,payout,balance:bal.balance});
    }
    if(p==="/api/admin/overview") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const [u,g,c,t]=await Promise.all([
        env.DB.prepare("SELECT COUNT(*) n FROM users").first(),env.DB.prepare("SELECT COUNT(*) n FROM games").first(),
        env.DB.prepare("SELECT COUNT(*) n FROM categories").first(),env.DB.prepare("SELECT COUNT(*) n FROM game_rounds").first()
      ]);
      return json({users:u.n,games:g.n,categories:c.n,rounds:t.n});
    }
    if(p==="/api/admin/users") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const rows=await env.DB.prepare("SELECT id,username,email,balance,role,created_at FROM users ORDER BY created_at DESC LIMIT 300").all();
      return json({users:rows.results});
    }
    if(p==="/api/admin/balance" && method==="POST") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const {userId,amount,note}=await req.json(),n=Math.floor(Number(amount));
      if(!Number.isSafeInteger(n)||n===0||Math.abs(n)>10000000) return json({error:"সঠিক পরিমাণ দিন"},400);
      const res=await env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=? AND balance+?>=0").bind(n,userId,n).run();
      if(!res.meta.changes) return json({error:"ইউজার পাওয়া যায়নি অথবা ব্যালেন্স অপর্যাপ্ত"},400);
      const u=await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(userId).first();
      await env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) VALUES(?,?,?,?,?,?)").bind(uid(),userId,"admin_adjustment",n,u.balance,String(note||"Admin credit adjustment").slice(0,160)).run();
      return json({ok:true,balance:u.balance});
    }
    if(p==="/api/admin/categories" && method==="GET") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const rows=await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order").all(); return json({categories:rows.results});
    }
    if(p==="/api/admin/categories" && method==="POST") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const {id,name,image_url,sort_order}=await req.json();
      if(!name) return json({error:"ক্যাটাগরির নাম দিন"},400);
      await env.DB.prepare("INSERT INTO categories(id,name,image_url,sort_order) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,image_url=excluded.image_url,sort_order=excluded.sort_order,active=1").bind(id||uid(),String(name).slice(0,80),String(image_url||"").slice(0,1000),Number(sort_order)||0).run();
      return json({ok:true});
    }
    if(p.startsWith("/api/admin/categories/") && method==="DELETE") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      await env.DB.prepare("UPDATE categories SET active=0 WHERE id=?").bind(p.split("/").pop()).run(); return json({ok:true});
    }
    if(p==="/api/admin/games" && method==="GET") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const rows=await env.DB.prepare("SELECT * FROM games ORDER BY sort_order").all(); return json({games:rows.results});
    }
    if(p==="/api/admin/games" && method==="POST") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const {id,name,category_id,image_url,game_type,html_content,sort_order}=await req.json();
      if(!name||!["aviator","superace","html"].includes(game_type)) return json({error:"গেমের নাম ও ধরন দিন"},400);
      const html=String(html_content||"");
      if(html.length>500000) return json({error:"HTML ফাইল ৫০০ KB-এর বেশি হতে পারবে না"},400);
      await env.DB.prepare("INSERT INTO games(id,name,category_id,image_url,game_type,html_content,sort_order) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,image_url=excluded.image_url,game_type=excluded.game_type,html_content=excluded.html_content,sort_order=excluded.sort_order,active=1").bind(id||uid(),String(name).slice(0,80),category_id||null,String(image_url||"").slice(0,1000),game_type,html,Number(sort_order)||0).run();
      return json({ok:true});
    }
    if(p.startsWith("/api/admin/games/") && method==="DELETE") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      await env.DB.prepare("UPDATE games SET active=0 WHERE id=?").bind(p.split("/").pop()).run(); return json({ok:true});
    }
    if(p==="/api/admin/settings" && method==="GET") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const rows=await env.DB.prepare("SELECT * FROM settings").all(); return json({settings:rows.results});
    }
    if(p==="/api/admin/settings" && method==="POST") {
      if(!await admin()) return json({error:"Admin access প্রয়োজন"},403);
      const {key,value}=await req.json();
      if(!key||String(key).length>80) return json({error:"Key প্রয়োজন"},400);
      await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value).slice(0,1000)).run(); return json({ok:true});
    }
    return json({error:"API route পাওয়া যায়নি"},404);
  }
  return env.ASSETS.fetch(req);
}
async function loginUser(id,env) {
  const token=b64(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hash(token),id,Date.now()+30*24*60*60*1000).run();
  const user=await env.DB.prepare("SELECT id,username,email,role,balance FROM users WHERE id=?").bind(id).first();
  return json({token,user});
}
export default {fetch:route};
