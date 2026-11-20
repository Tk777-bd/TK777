
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });

const uid = () => crypto.randomUUID();
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const enc = new TextEncoder();

const b64 = b =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

async function hash(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function passHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return [...new Uint8Array(bits)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function currentUser(req, env) {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer /, "");

  if (!token) return null;

  return await env.DB.prepare(`
    SELECT u.id,u.username,u.email,u.role,u.balance
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?
  `).bind(await hash(token), Date.now()).first() || null;
}

async function requireAdmin(req, env) {
  const u = await currentUser(req, env);
  return u && u.role === "admin" ? u : null;
}

/* ---------------- CRASH ENGINE ---------------- */

async function finishCrashSession(env, session) {
  if (!session || session.status !== "active") return;

  const current = Math.exp(
    Math.max(0, Date.now() - Number(session.start_ms)) / 12000
  );

  if (current < Number(session.crash_multiplier)) return;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO game_rounds
      (id,user_id,game_id,game_type,bet_amount,multiplier,payout)
      SELECT id,user_id,game_id,'aviator',bet_amount,crash_multiplier,0
      FROM crash_rounds
      WHERE session_id=? AND status='active'
    `).bind(session.id),

    env.DB.prepare(`
      UPDATE crash_rounds
      SET status='crashed',settled=1
      WHERE session_id=? AND status='active'
    `).bind(session.id),

    env.DB.prepare(`
      UPDATE crash_sessions
      SET status='crashed'
      WHERE id=? AND status='active'
    `).bind(session.id)
  ]);
}

async function getCrashSession(env, gameId) {
  let s = await env.DB.prepare(`
    SELECT *
    FROM crash_sessions
    WHERE game_id=? AND status='active'
    LIMIT 1
  `).bind(gameId).first();

  if (s) {
    await finishCrashSession(env, s);

    s = await env.DB.prepare(`
      SELECT * FROM crash_sessions WHERE id=?
    `).bind(s.id).first();

    if (s && s.status === "active") return s;
  }

  const last = await env.DB.prepare(`
    SELECT *
    FROM crash_sessions
    WHERE game_id=?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(gameId).first();

  if (last && last.status === "crashed") {
    const crashAt =
      Number(last.start_ms) +
      Math.log(Number(last.crash_multiplier)) * 12000;

    if (Date.now() < crashAt + 2500) return last;
  }

  const previewRow = await env.DB.prepare(`
    SELECT value FROM settings WHERE key='aviator_next_crash_multiplier'
  `).first();
  const previewValue = Number(previewRow?.value);
  const generatedMultiplier =
    Number.isFinite(previewValue) && previewValue >= 1.01 && previewValue <= 1000
      ? Number(previewValue.toFixed(2))
      : Number((1.05 + Math.pow(rand(), 2.2) * 8.95).toFixed(2));

  const fresh = {
    id: uid(),
    game_id: gameId,
    crash_multiplier: generatedMultiplier,
    start_ms: Date.now() + 5000
  };

  try {
    const inserted = await env.DB.prepare(`
      INSERT INTO crash_sessions
      (id,game_id,crash_multiplier,start_ms,status)
      SELECT ?,?,?,?,'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM crash_sessions WHERE game_id=? AND status='active'
      )
    `).bind(
      fresh.id,
      fresh.game_id,
      fresh.crash_multiplier,
      fresh.start_ms,
      gameId
    ).run();

    if (inserted.meta.changes) {
      const nextPreview = Number(
        (1.05 + Math.pow(rand(), 2.2) * 8.95).toFixed(2)
      );
      await env.DB.prepare(`
        INSERT INTO settings(key,value)
        VALUES('aviator_next_crash_multiplier',?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).bind(String(nextPreview)).run();
    }
  } catch (e) {
    // অন্য অনুরোধ ইতিমধ্যে নতুন রাউন্ড তৈরি করে থাকতে পারে।
  }

  s = await env.DB.prepare(`
    SELECT *
    FROM crash_sessions
    WHERE game_id=? AND status='active'
    LIMIT 1
  `).bind(gameId).first();

  return s || await env.DB.prepare(`
    SELECT *
    FROM crash_sessions
    WHERE game_id=?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(gameId).first();
}

async function crashState(env, gameId) {
  let s = await getCrashSession(env, gameId);

  if (!s) throw new Error("Crash session তৈরি করা যায়নি");

  if (s.status === "active") {
    await finishCrashSession(env, s);
  }

  s = await env.DB.prepare(`
    SELECT * FROM crash_sessions WHERE id=?
  `).bind(s.id).first();

  const now = Date.now();
  const startMs = Number(s.start_ms);
  const elapsed = Math.max(0, now - startMs);

  let phase = s.status;
  let multiplier = Number(s.crash_multiplier);
  let countdownMs = 0;

  if (s.status === "active") {
    if (now < startMs) {
      phase = "countdown";
      multiplier = 1;
      countdownMs = startMs - now;
    } else {
      phase = "active";
      multiplier = Number(Math.exp(elapsed / 12000).toFixed(2));
    }
  }

  const history = await env.DB.prepare(`
    SELECT crash_multiplier,created_at
    FROM crash_sessions
    WHERE game_id=? AND status='crashed'
    ORDER BY created_at DESC
    LIMIT 25
  `).bind(gameId).all();

  return {
    sessionId: s.id,
    status: phase,
    multiplier,
    countdownMs,
    crashMultiplier: Number(s.crash_multiplier),
    startMs,
    serverNow: Date.now(),
    previous: history.results || []
  };
}

/* ---------------- MAIN ROUTES ---------------- */

async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (p === "/api/health") {
    return json({ ok: true, site: "TK777" });
  }

  /* REGISTER: new accounts use mobile number + password; existing email accounts remain unchanged */

  if (p === "/api/register" && method === "POST") {
    const body = await req.json();
    let phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    const bnDigits = "০১২৩৪৫৬৭৮৯";
    phone = phone.replace(/[\s()-]/g, "");
    if (phone.startsWith("+880")) phone = "0" + phone.slice(4);
    else if (phone.startsWith("880")) phone = "0" + phone.slice(3);
    if (!/^01[3-9]\d{8}$/.test(phone)) return json({ error: "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন" }, 400);
    if (password.length < 6 || password.length > 128) return json({ error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে" }, 400);
    if (password !== confirmPassword) return json({ error: "পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না" }, 400);
    const id = uid(), salt = uid(), ph = await passHash(password, salt);
    try {
      await env.DB.prepare("INSERT INTO users (id,username,email,password_hash,password_salt,balance) VALUES(?,?,?,?,?,0)").bind(id, phone, phone, ph, salt).run();
      return await loginUser(id, env);
    } catch (e) { return json({ error: "এই মোবাইল নম্বর দিয়ে অ্যাকাউন্ট আগে থেকেই খোলা হয়েছে" }, 409); }
  }

  if (p === "/api/login" && method === "POST") {
    const body = await req.json();
    let phone = String(body.phone || "").trim();
    const password = body.password;
    const bnDigits = "০১২৩৪৫৬৭৮৯";
    phone = phone.replace(/[\s()-]/g, "");
    if (phone.startsWith("+880")) phone = "0" + phone.slice(4);
    else if (phone.startsWith("880")) phone = "0" + phone.slice(3);
    if (!/^01[3-9]\d{8}$/.test(phone)) return json({ error: "সঠিক মোবাইল নম্বর দিন" }, 400);
    const u = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(phone).first();
    if (!u || typeof password !== "string" || password.length > 128 || await passHash(password, u.password_salt) !== u.password_hash) {
      return json({ error: "লগইন তথ্য সঠিক নয়" }, 401);
    }
    return await loginUser(u.id, env);
  }

  /* ADMIN BOOTSTRAP */

  if (p === "/api/admin/bootstrap" && method === "POST") {
    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
      return json({ error: "Admin secrets configure করা হয়নি" }, 400);
    }

    const { email, password, username } = await req.json();

    if (
      String(email || "").toLowerCase() !==
        String(env.ADMIN_EMAIL).toLowerCase() ||
      password !== env.ADMIN_PASSWORD
    ) {
      return json({ error: "অনুমোদন হয়নি" }, 403);
    }

    let u = await env.DB.prepare(`
      SELECT id FROM users WHERE email=?
    `).bind(String(env.ADMIN_EMAIL).toLowerCase()).first();

    if (!u) {
      const id = uid();
      const salt = uid();
      const ph = await passHash(password, salt);

      await env.DB.prepare(`
        INSERT INTO users
        (id,username,email,password_hash,password_salt,balance,role)
        VALUES(?,?,?,?,?,0,'admin')
      `).bind(
        id,
        username || "Administrator",
        String(env.ADMIN_EMAIL).toLowerCase(),
        ph,
        salt
      ).run();

      u = { id };
    } else {
      await env.DB.prepare(`
        UPDATE users SET role='admin' WHERE id=?
      `).bind(u.id).run();
    }

    return await loginUser(u.id, env);
  }

  /* AUTHENTICATED API */

  if (p.startsWith("/api/")) {
    const user = await currentUser(req, env);
    const admin = () => requireAdmin(req, env);


    if (p === "/api/coin-requests" && method === "GET" && user) {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS coin_requests (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT)").run();
      const rows=await env.DB.prepare("SELECT id,amount,status,created_at FROM coin_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 30").bind(user.id).all();
      return json({requests:rows.results||[]});
    }
    if (p === "/api/coin-requests" && method === "POST") {
      if(!user)return json({error:"লগইন করুন"},401);
      const body=await req.json();const amount=Number(body.amount);
      if(![100,200,300,500,1000].includes(amount))return json({error:"সঠিক কয়েন পরিমাণ নির্বাচন করুন"},400);
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS coin_requests (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT)").run();
      const pending=await env.DB.prepare("SELECT id FROM coin_requests WHERE user_id=? AND status='pending' LIMIT 1").bind(user.id).first();
      if(pending)return json({error:"আপনার একটি Request এখনো Pending আছে"},409);
      await env.DB.prepare("INSERT INTO coin_requests(id,user_id,amount,status) VALUES(?,?,?,'pending')").bind(uid(),user.id,amount).run();
      return json({ok:true});
    }

    if (p === "/api/me") {
      return user
        ? json({ user })
        : json({ error: "লগইন করুন" }, 401);
    }

    if (p === "/api/logout" && method === "POST") {
      const token = (req.headers.get("Authorization") || "")
        .replace(/^Bearer /, "");

      if (token) {
        await env.DB.prepare(`
          DELETE FROM sessions WHERE token_hash=?
        `).bind(await hash(token)).run();
      }

      return json({ ok: true });
    }

    if (p === "/api/slot-display-images" && method === "GET") {
      const rows = await env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'slot_display_image_%' OR key IN ('slot_display_hidden','game_name_overrides')").all();
      const images = {};
      let hiddenIds = [];
      for (const row of (rows.results || [])) {
        if (row.key === 'slot_display_hidden') {
          try { hiddenIds = JSON.parse(String(row.value || '[]')); } catch { hiddenIds = []; }
          continue;
        }
        const id = String(row.key).replace(/^slot_display_image_/, "");
        const url = String(row.value || "").trim();
        if (/^https:\/\//i.test(url)) images[id] = url;
      }
      let nameOverrides = {};
      const nameRow = (rows.results || []).find(r => r.key === 'game_name_overrides');
      try { nameOverrides = JSON.parse(String(nameRow?.value || '{}')); } catch { nameOverrides = {}; }
      return json({ images, hiddenIds: Array.isArray(hiddenIds) ? hiddenIds.filter(x => typeof x === 'string') : [], nameOverrides });
    }

    if (p === "/api/support-settings" && method === "GET") {
      const rows = await env.DB.prepare("SELECT key,value FROM settings WHERE key IN ('support_telegram_username','support_telegram_image_url')").all();
      const values = Object.fromEntries((rows.results || []).map(r => [r.key,r.value]));
      const image = String(values.support_telegram_image_url || '');
      return json({telegram_username:String(values.support_telegram_username || ''),telegram_image_url:/^https:\/\//i.test(image) ? image : ''});
    }

  if (p === "/api/home-banners" && method === "GET") {
      const rows = await env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'home_banner_%' ORDER BY key").all();
      const banners = (rows.results || [])
        .map(r => String(r.value || "").trim())
        .filter(v => /^https:\/\//i.test(v))
        .slice(0,5);
      return json({ banners });
    }

    if (p === "/api/categories" && method === "GET") {
      const rows = await env.DB.prepare(`
        SELECT * FROM categories
        WHERE active=1
        ORDER BY sort_order
      `).all();

      return json({ categories: rows.results });
    }

    if (p === "/api/games" && method === "GET") {
      // Normalize the original game's display name once; admin can rename it later.
      await env.DB.prepare("UPDATE games SET name='Aviator' WHERE id='aviator' AND name='Aviator Free'").run();
      // Hide the duplicate Aviator 2 entry while preserving its historical rounds.
      await env.DB.prepare("UPDATE games SET active=0 WHERE id='aviator-2'").run();
      await env.DB.prepare(`
        UPDATE games SET sort_order=3
        WHERE id='super-ace' AND sort_order=2
      `).run();

      // Built-in free virtual-coin mini games; no paid provider/API required.
      const miniGames = [["gold-mines","Gold Mines","slots",4],["plinko","Plinko","slots",5],["classic-dice","Classic Dice","hot",6],["royal-coinflip","Royal Coinflip","hot",7],["european-roulette","European Roulette","live",8],["blackjack-21","Blackjack 21","poker",9],["baccarat","Baccarat","live",10],["diamond-slots","Diamond Slots","slots",11],["fortune-wheel","Fortune Wheel","lottery",12],["royal-keno","Royal Keno","lottery",13],["live-roulette","Live Roulette","live",14],["live-blackjack","Live Blackjack","live",15],["live-baccarat","Live Baccarat","live",16]];
      for (const [id,name,category,order] of miniGames) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO games
          (id,name,category_id,image_url,game_type,sort_order)
          VALUES(?,?,?,'','minigame',?)
        `).bind(id,name,category,order).run();
      }

      const rows = await env.DB.prepare(`
        SELECT id,name,category_id,image_url,game_type,
               html_content,active,sort_order
        FROM games
        WHERE active=1
        ORDER BY sort_order,id
      `).all();

      const nameRow = await env.DB.prepare("SELECT value FROM settings WHERE key='game_name_overrides'").first();
      let nameOverrides = {};
      try { nameOverrides = JSON.parse(String(nameRow?.value || '{}')); } catch { nameOverrides = {}; }
      const games = (rows.results || []).map(g => ({
        ...g,
        name: typeof nameOverrides[g.id] === 'string' && nameOverrides[g.id].trim()
          ? nameOverrides[g.id].trim().slice(0,80) : g.name
      }));
      return json({ games });
    }

    if (!user) {
      return json({ error: "লগইন করুন" }, 401);
    }

    /* HISTORY */

    if (p === "/api/history") {
      const rows = await env.DB.prepare(`
        SELECT type,amount,balance_after,note,created_at
        FROM transactions
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 50
      `).bind(user.id).all();

      const rounds = await env.DB.prepare(`
        SELECT game_id,bet_amount,multiplier,payout,created_at
        FROM game_rounds
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 30
      `).bind(user.id).all();

      return json({
        transactions: rows.results,
        rounds: rounds.results
      });
    }

    /* SUPER ACE */

    if (p === "/api/play" && method === "POST") {
      const { gameId, betAmount } = await req.json();
      const bet = Number(betAmount);

      if (
        !Number.isSafeInteger(bet) ||
        bet < 1 ||
        bet > 1000000
      ) {
        return json({
          error: "বেটের পরিমাণ ১ থেকে ১০,০০,০০০ ফ্রি ক্রেডিটের মধ্যে দিন"
        }, 400);
      }

      const game = await env.DB.prepare(`
        SELECT * FROM games WHERE id=? AND active=1
      `).bind(gameId).first();

      if (!game || game.game_type !== "superace") {
        return json({ error: "এই গেমের ধরন সঠিক নয়" }, 404);
      }

      const r = rand();
      const multiplier = Number(
        (r < 0.45 ? 0 : r < 0.78 ? 0.5 : r < 0.95 ? 1.5 : 3)
          .toFixed(2)
      );

      const payout = Math.floor(bet * multiplier);
      const roundId = uid();

      const debit = await env.DB.prepare(`
        UPDATE users
        SET balance=balance-?
        WHERE id=? AND balance>=?
      `).bind(bet, user.id, bet).run();

      if (!debit.meta.changes) {
        return json({ error: "পর্যাপ্ত ফ্রি ক্রেডিট নেই" }, 400);
      }

      try {
        if (payout) {
          await env.DB.prepare(`
            UPDATE users SET balance=balance+? WHERE id=?
          `).bind(payout, user.id).run();
        }

        const bal = await env.DB.prepare(`
          SELECT balance FROM users WHERE id=?
        `).bind(user.id).first();

        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO game_rounds
            (id,user_id,game_id,game_type,bet_amount,multiplier,payout)
            VALUES(?,?,?,?,?,?,?)
          `).bind(
            roundId, user.id, gameId, "superace",
            bet, multiplier, payout
          ),

          env.DB.prepare(`
            INSERT INTO transactions
            (id,user_id,type,amount,balance_after,note)
            VALUES(?,?,?,?,?,?)
          `).bind(
            uid(), user.id, "game", -bet,
            bal.balance - payout, game.name + " বেট"
          ),

          ...(payout ? [
            env.DB.prepare(`
              INSERT INTO transactions
              (id,user_id,type,amount,balance_after,note)
              VALUES(?,?,?,?,?,?)
            `).bind(
              uid(), user.id, "win", payout,
              bal.balance, game.name + " জয়"
            )
          ] : [])
        ]);

        return json({
          multiplier,
          payout,
          balance: bal.balance,
          roundId
        });
      } catch (e) {
        await env.DB.prepare(`
          UPDATE users SET balance=balance+? WHERE id=?
        `).bind(bet - payout, user.id).run();

        throw e;
      }
    }

    /* FREE VIRTUAL-COIN MINI GAMES: outcomes are generated on the server. */
    if (p === "/api/mini-play" && method === "POST") {
      const body = await req.json();
      const gameId = String(body.gameId || "");
      const bet = Number(body.betAmount);
      const choice = String(body.choice || "");
      if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000) {
        return json({ error: "১ থেকে ১০,০০,০০০ ফ্রি কয়েনের মধ্যে বেট দিন" }, 400);
      }
      const game = await env.DB.prepare(
        "SELECT id,name,game_type FROM games WHERE id=? AND active=1"
      ).bind(gameId).first();
      if (!game || game.game_type !== "minigame") {
        return json({ error: "গেমটি পাওয়া যায়নি" }, 404);
      }

      let multiplier = 0, result = "", detail = "";
      const pick = (arr) => arr[Math.floor(rand() * arr.length)];
      if (gameId === "gold-mines") {
        const mine = 1 + Math.floor(rand() * 5);
        const selected = Number(choice);
        if (!Number.isInteger(selected) || selected < 1 || selected > 5) return json({error:"১ থেকে ৫-এর একটি ঘর বাছুন"},400);
        multiplier = selected === mine ? 0 : 1.8;
        result = selected === mine ? "💣 মাইন! বেট হারিয়েছেন" : "💎 নিরাপদ ঘর! জয়";
        detail = "আপনার ঘর: " + selected + " · মাইন: " + mine;
      } else if (gameId === "plinko") {
        multiplier = pick([0,0,0.5,0.5,1,1,1.5,2,3,5]);
        result = multiplier > 0 ? "বলটি জিতেছে!" : "বলটি শূন্য ঘরে পড়েছে";
        detail = "মাল্টিপ্লায়ার " + multiplier + "x";
      } else if (gameId === "classic-dice") {
        if (!["high","low"].includes(choice)) return json({error:"High অথবা Low বাছুন"},400);
        const roll = 1 + Math.floor(rand() * 6);
        multiplier = (choice === "high" ? roll >= 4 : roll <= 3) ? 1.9 : 0;
        result = "ডাইস: " + roll + " · " + (multiplier ? "আপনি জিতেছেন" : "আপনি হেরেছেন");
        detail = choice === "high" ? "High (৪–৬)" : "Low (১–৩)";
      } else if (gameId === "royal-coinflip") {
        if (!["heads","tails"].includes(choice)) return json({error:"Heads অথবা Tails বাছুন"},400);
        const side = pick(["heads","tails"]);
        multiplier = choice === side ? 1.9 : 0;
        result = side === "heads" ? "🪙 HEADS" : "🪙 TAILS";
        detail = multiplier ? "সঠিক অনুমান!" : "ভুল অনুমান";
      } else if (gameId === "european-roulette") {
        if (!["red","black","green"].includes(choice)) return json({error:"Roulette-এর রং বাছুন"},400);
        const n = Math.floor(rand() * 37);
        const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
        const color = n === 0 ? "green" : red.has(n) ? "red" : "black";
        multiplier = choice === color ? (color === "green" ? 14 : 1.9) : 0;
        result = "বল পড়েছে " + n + " · " + color.toUpperCase();
        detail = "আপনার পছন্দ: " + choice.toUpperCase();
      } else if (gameId === "blackjack-21") {
        const total = 4 + Math.floor(rand() * 18);
        multiplier = total >= 18 ? 1.8 : 0;
        result = "আপনার কার্ডের মোট: " + total;
        detail = total >= 18 ? "২১-এর কাছাকাছি! জয়" : "১৮-এর কম · হার";
      } else if (gameId === "baccarat") {
        if (!["player","banker","tie"].includes(choice)) return json({error:"Player, Banker অথবা Tie বাছুন"},400);
        const outcome = pick(["player","banker","player","banker","tie"]);
        multiplier = choice === outcome ? (outcome === "tie" ? 8 : 1.95) : 0;
        result = "ফলাফল: " + outcome.toUpperCase();
        detail = "আপনার পছন্দ: " + choice.toUpperCase();
      } else if (gameId === "diamond-slots") {
        const symbols = ["💎","7️⃣","🔔","🍀","👑"];
        const reels = [pick(symbols),pick(symbols),pick(symbols)];
        const counts = Object.fromEntries(reels.map(x => [x,(reels.filter(y=>y===x).length)]));
        const max = Math.max(...Object.values(counts));
        multiplier = max === 3 ? 5 : max === 2 ? 1.5 : 0;
        result = reels.join("  ");
        detail = max === 3 ? "জ্যাকপট!" : max === 2 ? "দুটি মিলেছে!" : "মিল পাওয়া যায়নি";
      } else if (gameId === "fortune-wheel") {
        multiplier = pick([0,0,0.5,1,1,1.5,2,3,5,10]);
        result = "চাকা থেমেছে " + multiplier + "x-এ";
        detail = multiplier > 0 ? "আপনার পেআউট তৈরি হয়েছে" : "এইবার জয় হয়নি";
      } else if (gameId === "royal-keno") {
        const selected = Number(choice);
        if (!Number.isInteger(selected) || selected < 1 || selected > 10) return json({error:"১ থেকে ১০-এর মধ্যে একটি নম্বর বাছুন"},400);
        const drawn = 1 + Math.floor(rand() * 10);
        multiplier = selected === drawn ? 8 : 0;
        result = "ড্র নম্বর: " + drawn;
        detail = selected === drawn ? "নম্বর মিলেছে!" : "নম্বর মেলেনি";
      } else if (gameId === "live-roulette") {
        if (!["red","black","green"].includes(choice)) return json({error:"রং বাছুন"},400);
        const n = Math.floor(rand() * 37);
        const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
        const color = n === 0 ? "green" : red.has(n) ? "red" : "black";
        multiplier = choice === color ? (color === "green" ? 14 : 1.9) : 0;
        result = "ডিলারের রুলেট থেমেছে " + n + " · " + color.toUpperCase();
        detail = "সিমুলেটেড লাইভ টেবিল · আপনার পছন্দ " + choice.toUpperCase();
      } else if (gameId === "live-blackjack") {
        const player = 15 + Math.floor(rand() * 7);
        const dealer = 15 + Math.floor(rand() * 7);
        multiplier = player <= 21 && (dealer > 21 || player > dealer) ? 1.9 : player === dealer ? 1 : 0;
        result = "PLAYER " + player + " · DEALER " + dealer;
        detail = "ডিলারের কার্ড খোলা হয়েছে · " + (multiplier === 1.9 ? "আপনি জিতেছেন" : multiplier === 1 ? "টাই" : "ডিলার জিতেছেন");
      } else if (gameId === "live-baccarat") {
        if (!["player","banker","tie"].includes(choice)) return json({error:"Player, Banker অথবা Tie বাছুন"},400);
        const outcome = pick(["player","banker","player","banker","tie"]);
        multiplier = choice === outcome ? (outcome === "tie" ? 8 : 1.95) : 0;
        result = "ডিলারের ফলাফল: " + outcome.toUpperCase();
        detail = "সিমুলেটেড লাইভ টেবিল · আপনার পছন্দ " + choice.toUpperCase();
      } else {
        return json({error:"এই গেমটি সমর্থিত নয়"},400);
      }

      const payout = Math.floor(bet * multiplier);
      const debit = await env.DB.prepare(
        "UPDATE users SET balance=balance-? WHERE id=? AND balance>=?"
      ).bind(bet,user.id,bet).run();
      if (!debit.meta.changes) return json({error:"পর্যাপ্ত ফ্রি Virtual Coin নেই"},400);

      try {
        if (payout) await env.DB.prepare(
          "UPDATE users SET balance=balance+? WHERE id=?"
        ).bind(payout,user.id).run();
        const bal = await env.DB.prepare("SELECT balance FROM users WHERE id=?").bind(user.id).first();
        const roundId = uid();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO game_rounds(id,user_id,game_id,game_type,bet_amount,multiplier,payout) VALUES(?,?,?,?,?,?,?)")
            .bind(roundId,user.id,gameId,"minigame",bet,multiplier,payout),
          env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) VALUES(?,?,?,?,?,?)")
            .bind(uid(),user.id,"game",-bet,bal.balance-payout,game.name+" বেট"),
          ...(payout ? [env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) VALUES(?,?,?,?,?,?)")
            .bind(uid(),user.id,"win",payout,bal.balance,game.name+" জয়")] : [])
        ]);
        return json({ok:true,multiplier,payout,balance:bal.balance,result,detail,roundId});
      } catch (e) {
        await env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=?").bind(bet-payout,user.id).run();
        throw e;
      }
    }

    /* CRASH: GLOBAL STATE */

    if (p === "/api/crash/state" && method === "POST") {
      const { gameId } = await req.json();

      const game = await env.DB.prepare(`
        SELECT id FROM games
        WHERE id=? AND active=1 AND game_type='aviator'
      `).bind(gameId).first();

      if (!game) {
        return json({ error: "Crash গেম পাওয়া যায়নি" }, 404);
      }

      return json(await crashState(env, gameId));
    }

    /* CRASH: PLACE BET */

    if (p === "/api/crash/start" && method === "POST") {
      const { gameId, betAmount } = await req.json();
      const bet = Number(betAmount);

      if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000) {
        return json({
          error: "বেট ১ থেকে ১০,০০,০০০ ফ্রি ক্রেডিটের মধ্যে দিন"
        }, 400);
      }

      // One indexed read replaces crashState() and its extra history/session reads.
      const session = await env.DB.prepare(`
        SELECT cs.*,g.name AS game_name
        FROM crash_sessions cs
        JOIN games g ON g.id=cs.game_id
        WHERE cs.game_id=? AND cs.status='active'
          AND g.active=1 AND g.game_type='aviator'
        ORDER BY cs.created_at DESC
        LIMIT 1
      `).bind(gameId).first();

      if (!session) {
        return json({ error: "Crash গেম বা রাউন্ড পাওয়া যায়নি" }, 404);
      }

      const now = Date.now();
      if (now >= Number(session.start_ms)) {
        return json({
          error: "বেট করার সময় শেষ, পরের রাউন্ডে চেষ্টা করুন"
        }, 409);
      }

      const current = Math.exp(
        Math.max(0, now - Number(session.start_ms)) / 12000
      );

      if (current >= Number(session.crash_multiplier)) {
        return json({
          error: "রাউন্ড শেষ হয়ে গেছে, পরের রাউন্ডে চেষ্টা করুন"
        }, 409);
      }

      // Preserve the conditional atomic balance debit.
      const debit = await env.DB.prepare(`
        UPDATE users SET balance=balance-?
        WHERE id=? AND balance>=?
      `).bind(bet, user.id, bet).run();

      if (!debit.meta.changes) {
        return json({ error: "পর্যাপ্ত ফ্রি ক্রেডিট নেই" }, 400);
      }

      const roundId = uid();

      try {
        const ins = await env.DB.prepare(`
          INSERT INTO crash_rounds
          (id,user_id,game_id,bet_amount,crash_multiplier,
           start_ms,status,session_id)
          SELECT ?,?,?,?,?,?,'active',?
          WHERE EXISTS (
            SELECT 1 FROM crash_sessions
            WHERE id=? AND status='active'
              AND start_ms>? AND crash_multiplier>?
          )
        `).bind(
          roundId,user.id,gameId,bet,session.crash_multiplier,
          session.start_ms,session.id,session.id,Date.now(),current
        ).run();

        if (!ins.meta.changes) {
          throw new Error("বেট করার সময় শেষ, আবার চেষ্টা করুন");
        }

        const bal = await env.DB.prepare(
          "SELECT balance FROM users WHERE id=?"
        ).bind(user.id).first();

        await env.DB.prepare(`
          INSERT INTO transactions
          (id,user_id,type,amount,balance_after,note)
          VALUES(?,?,?,?,?,?)
        `).bind(
          uid(),user.id,"game",-bet,bal.balance,session.game_name+" বেট"
        ).run();

        return json({
          roundId,
          sessionId: session.id,
          balance: bal.balance
        });
      } catch (e) {
        await env.DB.prepare(
          "UPDATE users SET balance=balance+? WHERE id=?"
        ).bind(bet,user.id).run();
        throw e;
      }
    }

    /* CRASH: CANCEL BET DURING COUNTDOWN */
    if (p === "/api/crash/cancel" && method === "POST") {
      const { roundId } = await req.json();
      if (!roundId) return json({ error: "roundId প্রয়োজন" }, 400);

      const round = await env.DB.prepare(`
        SELECT * FROM crash_rounds
        WHERE id=? AND user_id=? AND status='active'
      `).bind(roundId, user.id).first();

      if (!round) return json({ error: "বাতিল করার মতো সক্রিয় বেট নেই" }, 404);

      const session = await env.DB.prepare(`
        SELECT * FROM crash_sessions
        WHERE id=? AND status='active'
      `).bind(round.session_id).first();

      if (!session || Date.now() >= Number(session.start_ms)) {
        return json({ error: "কাউন্টডাউন শেষ, এখন বেট বাতিল করা যাবে না" }, 409);
      }

      const cancelled = await env.DB.prepare(`
        UPDATE crash_rounds SET status='cancelled', payout=0
        WHERE id=? AND user_id=? AND status='active'
          AND EXISTS (
            SELECT 1 FROM crash_sessions
            WHERE id=crash_rounds.session_id AND status='active' AND start_ms>?
          )
      `).bind(roundId, user.id, Date.now()).run();

      if (!cancelled.meta.changes) {
        return json({ error: "কাউন্টডাউন শেষ, বেট বাতিল করা যায়নি" }, 409);
      }

      await env.DB.prepare(`
        UPDATE users SET balance=balance+? WHERE id=?
      `).bind(Number(round.bet_amount), user.id).run();

      const bal = await env.DB.prepare(`
        SELECT balance FROM users WHERE id=?
      `).bind(user.id).first();

      await env.DB.prepare(`
        INSERT INTO transactions
        (id,user_id,type,amount,balance_after,note)
        VALUES(?,?,?,?,?,?)
      `).bind(
        uid(), user.id, "refund", Number(round.bet_amount),
        bal.balance, "Aviator বেট বাতিলের রিফান্ড"
      ).run();

      return json({ ok: true, balance: bal.balance });
    }

    /* CRASH: UPDATE BET STATUS */

    if (p === "/api/crash/tick" && method === "POST") {
      const { roundId, gameId } = await req.json();

      if (!roundId) {
        if (!gameId) {
          return json({ error: "gameId প্রয়োজন" }, 400);
        }

        return json(await crashState(env, gameId));
      }

      const round = await env.DB.prepare(`
        SELECT *
        FROM crash_rounds
        WHERE id=? AND user_id=?
      `).bind(roundId, user.id).first();

      if (!round) {
        return json({ error: "রাউন্ড পাওয়া যায়নি" }, 404);
      }

      const state = await crashState(env, round.game_id);

      const latest = await env.DB.prepare(`
        SELECT * FROM crash_rounds WHERE id=?
      `).bind(roundId).first();

      const bal = await env.DB.prepare(`
        SELECT balance FROM users WHERE id=?
      `).bind(user.id).first();

      return json({
        ...state,
        betStatus: latest.status,
        payout: latest.payout || 0,
        balance: bal.balance,
        roundId
      });
    }

    /* CRASH: CASH OUT */

    if (p === "/api/crash/cashout" && method === "POST") {
      const { roundId } = await req.json();

      const round = await env.DB.prepare(`
        SELECT *
        FROM crash_rounds
        WHERE id=? AND user_id=?
      `).bind(roundId, user.id).first();

      if (!round) {
        return json({ error: "রাউন্ড পাওয়া যায়নি" }, 404);
      }

      const session = round.session_id
        ? await env.DB.prepare(`
            SELECT * FROM crash_sessions WHERE id=?
          `).bind(round.session_id).first()
        : null;

      if (!session || session.status !== "active") {
        if (session) {
          await finishCrashSession(env, session);
        }

        const f = await env.DB.prepare(`
          SELECT * FROM crash_rounds WHERE id=?
        `).bind(roundId).first();

        const b = await env.DB.prepare(`
          SELECT balance FROM users WHERE id=?
        `).bind(user.id).first();

        return json({
          status: f.status,
          multiplier: f.cashout_multiplier || round.crash_multiplier,
          payout: f.payout || 0,
          balance: b.balance
        });
      }

      if (Date.now() < Number(session.start_ms)) {
        return json({
          error: "প্লেন এখনো উড়তে শুরু করেনি"
        }, 409);
      }

      const current = Number(
        Math.exp(
          Math.max(0, Date.now() - Number(session.start_ms)) / 12000
        ).toFixed(2)
      );

      if (current >= Number(session.crash_multiplier)) {
        await finishCrashSession(env, session);

        const f = await env.DB.prepare(`
          SELECT * FROM crash_rounds WHERE id=?
        `).bind(roundId).first();

        const b = await env.DB.prepare(`
          SELECT balance FROM users WHERE id=?
        `).bind(user.id).first();

        return json({
          status: f.status,
          multiplier: session.crash_multiplier,
          payout: 0,
          balance: b.balance
        });
      }

      const payout = Math.round(Number(round.bet_amount) * current * 100) / 100;

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE crash_rounds
          SET status='cashed_out',
              cashout_multiplier=?,
              payout=?
          WHERE id=?
            AND user_id=?
            AND status='active'
            AND EXISTS (
              SELECT 1 FROM crash_sessions
              WHERE id=? AND status='active'
                AND crash_multiplier>?
            )
        `).bind(
          current, payout, roundId, user.id,
          session.id, current
        ),

        env.DB.prepare(`
          UPDATE users
          SET balance=balance+?
          WHERE id=?
            AND EXISTS (
              SELECT 1 FROM crash_rounds
              WHERE id=? AND status='cashed_out' AND settled=0
            )
        `).bind(payout, user.id, roundId),

        env.DB.prepare(`
          INSERT INTO transactions
          (id,user_id,type,amount,balance_after,note)
          SELECT ?,?,'win',?,balance,?
          FROM users
          WHERE id=?
            AND EXISTS (
              SELECT 1 FROM crash_rounds
              WHERE id=? AND status='cashed_out' AND settled=0
            )
        `).bind(
          uid(), user.id, payout,
          "Crash গেমে Cash Out",
          user.id, roundId
        ),

        env.DB.prepare(`
          INSERT OR IGNORE INTO game_rounds
          (id,user_id,game_id,game_type,bet_amount,multiplier,payout)
          SELECT id,user_id,game_id,'aviator',
                 bet_amount,cashout_multiplier,payout
          FROM crash_rounds
          WHERE id=? AND status='cashed_out' AND settled=0
        `).bind(roundId),

        env.DB.prepare(`
          UPDATE crash_rounds
          SET settled=1
          WHERE id=? AND status='cashed_out' AND settled=0
        `).bind(roundId)
      ]);

      const f = await env.DB.prepare(`
        SELECT * FROM crash_rounds WHERE id=?
      `).bind(roundId).first();

      const b = await env.DB.prepare(`
        SELECT balance FROM users WHERE id=?
      `).bind(user.id).first();

      return json({
        status: f.status,
        multiplier: f.cashout_multiplier || f.crash_multiplier,
        payout: f.payout || 0,
        balance: b.balance
      });
    }

    /* ADMIN AVIATOR ROUND CONTROL */

    if (p === "/api/admin/aviator-control" && method === "GET") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const game = await env.DB.prepare(`
        SELECT id FROM games
        WHERE id='aviator' AND active=1 AND game_type='aviator'
        LIMIT 1
      `).first();

      if (!game) return json({ error: "Aviator game পাওয়া যায়নি" }, 404);

      const state = await crashState(env, game.id);
      const current = await env.DB.prepare(`
        SELECT crash_multiplier,status,start_ms
        FROM crash_sessions WHERE id=?
      `).bind(state.sessionId).first();

      let next = await env.DB.prepare(`
        SELECT value FROM settings WHERE key='aviator_next_crash_multiplier'
      `).first();

      if (!next || !Number.isFinite(Number(next.value)) || Number(next.value) < 1.01 || Number(next.value) > 1000) {
        const value = Number((1.05 + Math.pow(rand(), 2.2) * 8.95).toFixed(2));
        await env.DB.prepare(`
          INSERT INTO settings(key,value)
          VALUES('aviator_next_crash_multiplier',?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `).bind(String(value)).run();
        next = { value: String(value) };
      }

      return json({
        currentRound: current ? {
          crashMultiplier: Number(current.crash_multiplier),
          status: state.status,
          multiplier: Number(state.multiplier || 1),
          startMs: Number(current.start_ms)
        } : null,
        nextCrashMultiplier: Number(next.value)
      });
    }

    if (p === "/api/admin/aviator-control" && method === "POST") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const { multiplier } = await req.json();
      const value = Number(multiplier);

      if (!Number.isFinite(value) || value < 1.01 || value > 1000) {
        return json({ error: "Multiplier 1.01x থেকে 1000.00x-এর মধ্যে দিন" }, 400);
      }

      const normalized = Number(value.toFixed(2));
      await env.DB.prepare(`
        INSERT INTO settings(key,value)
        VALUES('aviator_next_crash_multiplier',?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).bind(String(normalized)).run();

      return json({ ok: true, nextCrashMultiplier: normalized });
    }

    /* ADMIN OVERVIEW */

    if (p === "/api/admin/overview") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const [u, g, c, t] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) n FROM users").first(),
        env.DB.prepare("SELECT COUNT(*) n FROM games").first(),
        env.DB.prepare("SELECT COUNT(*) n FROM categories").first(),
        env.DB.prepare("SELECT COUNT(*) n FROM game_rounds").first()
      ]);

      return json({
        users: u.n,
        games: g.n,
        categories: c.n,
        rounds: t.n
      });
    }

    /* ADMIN USERS */

    if (p === "/api/admin/users") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const rows = await env.DB.prepare(`
        SELECT id,username,email,balance,role,created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 300
      `).all();

      return json({ users: rows.results });
    }

    /* ADMIN BALANCE */

    if (p === "/api/admin/balance" && method === "POST") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const { userId, amount, note } = await req.json();
      const n = Math.floor(Number(amount));

      if (
        !Number.isSafeInteger(n) ||
        n === 0 ||
        Math.abs(n) > 10000000
      ) {
        return json({ error: "সঠিক পরিমাণ দিন" }, 400);
      }

      const res = await env.DB.prepare(`
        UPDATE users
        SET balance=balance+?
        WHERE id=? AND balance+?>=0
      `).bind(n, userId, n).run();

      if (!res.meta.changes) {
        return json({
          error: "ইউজার পাওয়া যায়নি অথবা ব্যালেন্স অপর্যাপ্ত"
        }, 400);
      }

      const u = await env.DB.prepare(`
        SELECT balance FROM users WHERE id=?
      `).bind(userId).first();

      await env.DB.prepare(`
        INSERT INTO transactions
        (id,user_id,type,amount,balance_after,note)
        VALUES(?,?,?,?,?,?)
      `).bind(
        uid(),
        userId,
        "admin_adjustment",
        n,
        u.balance,
        String(note || "Admin credit adjustment").slice(0, 160)
      ).run();

      return json({ ok: true, balance: u.balance });
    }

    /* ADMIN CATEGORIES */

    if (p === "/api/admin/categories" && method === "GET") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const rows = await env.DB.prepare(`
        SELECT * FROM categories ORDER BY sort_order
      `).all();

      return json({ categories: rows.results });
    }

    if (p === "/api/admin/categories" && method === "POST") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const { id, name, image_url, sort_order } = await req.json();

      if (!name) {
        return json({ error: "ক্যাটাগরির নাম দিন" }, 400);
      }

      await env.DB.prepare(`
        INSERT INTO categories(id,name,image_url,sort_order)
        VALUES(?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          image_url=excluded.image_url,
          sort_order=excluded.sort_order,
          active=1
      `).bind(
        id || uid(),
        String(name).slice(0, 80),
        String(image_url || "").slice(0, 1000),
        Number(sort_order) || 0
      ).run();

      return json({ ok: true });
    }

    if (p.startsWith("/api/admin/categories/") && method === "DELETE") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      await env.DB.prepare(`
        UPDATE categories SET active=0 WHERE id=?
      `).bind(p.split("/").pop()).run();

      return json({ ok: true });
    }

    /* ADMIN GAMES */

    if (p === "/api/admin/games" && method === "GET") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      await env.DB.prepare("UPDATE games SET name='Aviator' WHERE id='aviator' AND name='Aviator Free'").run();
      const rows = await env.DB.prepare(`
        SELECT * FROM games ORDER BY sort_order
      `).all();

      return json({ games: rows.results });
    }

    if (p === "/api/admin/games" && method === "POST") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const {
        id, name, category_id, image_url,
        game_type, html_content, sort_order
      } = await req.json();

      if (!name || !["aviator", "superace", "html"].includes(game_type)) {
        return json({ error: "গেমের নাম ও ধরন দিন" }, 400);
      }

      const html = String(html_content || "");

      if (html.length > 500000) {
        return json({
          error: "HTML ফাইল ৫০০ KB-এর বেশি হতে পারবে না"
        }, 400);
      }

      await env.DB.prepare(`
        INSERT INTO games
        (id,name,category_id,image_url,game_type,html_content,sort_order)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          category_id=excluded.category_id,
          image_url=excluded.image_url,
          game_type=excluded.game_type,
          html_content=excluded.html_content,
          sort_order=excluded.sort_order,
          active=1
      `).bind(
        id || uid(),
        String(name).slice(0, 80),
        category_id || null,
        String(image_url || "").slice(0, 1000),
        game_type,
        html,
        Number(sort_order) || 0
      ).run();

      return json({ ok: true });
    }

    if (p === "/api/admin/game-name" && method === "POST") {
      if (!await admin()) return json({ error: "Admin access প্রয়োজন" }, 403);
      const { id, name } = await req.json();
      const gameId = String(id || '').trim();
      const gameName = String(name || '').trim().slice(0,80);
      if (!gameId || !gameName) return json({ error: "গেমের ID ও নতুন নাম দিন" }, 400);
      const row = await env.DB.prepare("SELECT id FROM games WHERE id=?").bind(gameId).first();
      if (row) {
        await env.DB.prepare("UPDATE games SET name=? WHERE id=?").bind(gameName,gameId).run();
      } else if (gameId.startsWith('slot-display-')) {
        const current = await env.DB.prepare("SELECT value FROM settings WHERE key='game_name_overrides'").first();
        let overrides = {};
        try { overrides = JSON.parse(String(current?.value || '{}')); } catch { overrides = {}; }
        overrides[gameId] = gameName;
        await env.DB.prepare("INSERT INTO settings(key,value) VALUES('game_name_overrides',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind(JSON.stringify(overrides).slice(0,10000)).run();
      } else {
        return json({ error: "গেম পাওয়া যায়নি" }, 404);
      }
      return json({ ok: true, name: gameName });
    }

    if (p.startsWith("/api/admin/games/") && method === "DELETE") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      await env.DB.prepare(`
        UPDATE games SET active=0 WHERE id=?
      `).bind(p.split("/").pop()).run();

      return json({ ok: true });
    }


    if (p === "/api/admin/coin-requests" && method === "GET") {
      if(!await admin())return json({error:"Admin access প্রয়োজন"},403);
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS coin_requests (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT)").run();
      const q=String(url.searchParams.get("q")||"").trim();
      const rows=q
        ? await env.DB.prepare("SELECT cr.id,cr.user_id,cr.amount,cr.status,cr.created_at,u.username,u.email FROM coin_requests cr JOIN users u ON u.id=cr.user_id WHERE u.username LIKE ? OR u.email LIKE ? ORDER BY cr.created_at DESC LIMIT 200").bind('%'+q+'%','%'+q+'%').all()
        : await env.DB.prepare("SELECT cr.id,cr.user_id,cr.amount,cr.status,cr.created_at,u.username,u.email FROM coin_requests cr JOIN users u ON u.id=cr.user_id ORDER BY cr.created_at DESC LIMIT 200").all();
      return json({requests:rows.results||[]});
    }
    if (p === "/api/admin/coin-requests/review" && method === "POST") {
      if(!await admin())return json({error:"Admin access প্রয়োজন"},403);
      const body=await req.json();const status=String(body.status||'');
      if(!['approved','rejected'].includes(status))return json({error:"সঠিক সিদ্ধান্ত দিন"},400);
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS coin_requests (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT)").run();
      const cr=await env.DB.prepare("SELECT * FROM coin_requests WHERE id=? AND status='pending'").bind(String(body.id||'')).first();
      if(!cr)return json({error:"Request পাওয়া যায়নি অথবা আগেই Review হয়েছে"},404);
      if(status==='approved'){
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET balance=balance+? WHERE id=?").bind(cr.amount,cr.user_id),
          env.DB.prepare("INSERT INTO transactions(id,user_id,type,amount,balance_after,note) SELECT ?,id,'free_coin',?,balance,'Admin approved free virtual coin request' FROM users WHERE id=?").bind(uid(),cr.amount,cr.user_id)
        ]);
      }
      await env.DB.prepare("UPDATE coin_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status='pending'").bind(status,user.id,cr.id).run();
      return json({ok:true});
    }

    /* ADMIN SETTINGS */

    if (p === "/api/admin/settings" && method === "GET") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const rows = await env.DB.prepare(`
        SELECT * FROM settings
      `).all();

      return json({ settings: rows.results });
    }

    if (p === "/api/admin/settings" && method === "POST") {
      if (!await admin()) {
        return json({ error: "Admin access প্রয়োজন" }, 403);
      }

      const { key, value } = await req.json();

      if (!key || String(key).length > 80) {
        return json({ error: "Key প্রয়োজন" }, 400);
      }

      await env.DB.prepare(`
        INSERT INTO settings(key,value)
        VALUES(?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).bind(key, String(value).slice(0, 1000)).run();

      return json({ ok: true });
    }

    return json({ error: "API route পাওয়া যায়নি" }, 404);
  }

  return env.ASSETS.fetch(req);
}

async function loginUser(id, env) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));

  await env.DB.prepare(`
    INSERT INTO sessions(token_hash,user_id,expires_at)
    VALUES(?,?,?)
  `).bind(
    await hash(token),
    id,
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).run();

  const user = await env.DB.prepare(`
    SELECT id,username,email,role,balance
    FROM users WHERE id=?
  `).bind(id).first();

  return json({ token, user });
}

export default {
  async fetch(req, env, ctx) {
    try {
      return await route(req, env);
    } catch (err) {
      console.error("TK777 Worker exception", {
        message: err?.message,
        stack: err?.stack,
        path: new URL(req.url).pathname
      });

      return json({
        error: "Worker exception",
        details: String(err?.message || err)
      }, 500);
    }
  }
};
