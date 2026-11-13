// Jude's Merge Champion – game server for the Netlify version.
// Keeps the shared leaderboard and player-to-player challenges in Netlify Blobs.
//
// Each device is a player: it makes up a random id and a secret token the first
// time it connects. Only the device holding the token can change that player's
// score or answer that player's challenges.
//
// Keys in the "merge-champion" store:
//   players/<id>          { id, tokenHash, created, score? }
//   in/<to>/<from>        a challenge, as the receiving player sees it
//   out/<from>/<to>       the same challenge, as the sending player sees it
//   saves/<id>            { save, savedAt } – the player's whole game, so it can move between phones
//   codes/<sha256(code)>  { id } – a profile code that signs a new phone in as that player
//
// The game's owner can remove old players with the "admin" route. It needs the
// ADMIN_KEY environment variable set in Netlify (Project configuration →
// Environment variables); without it, nobody can remove players.
import { getStore } from "@netlify/blobs";

const PART_IDS = new Set([
  "toaster", "battery", "wheel", "spring", "magnet", "gear", "duck", "fan", "rocket", "laser",
  "vacuum", "sock", "drill", "clock", "glove", "skateboard", "pizza", "bulb", "umbrella", "trumpet", "banana",
  "volcano", "storm", "shark", "blackhole", "unicorn", "diamond", "meteor", "timer", "ghost", "crown",
  "dragon", "tornado", "trex", "phoenix",
]);
const STYLE_IDS = new Set(["classic", "knight", "shadow", "pilot", "scout", "commando"]);
const GUN_IDS = new Set(["pea", "minigun", "goo", "flame", "lightning", "rocket", "grenade", "freeze", "shotgun", "mega", "sniper"]);
const VEHICLE_IDS = new Set(["tank", "car", "jet", "rocket"]);
const WEAPON_IDS = new Set(["blue", "green", "purple", "red", "spear", "gold", "axe", "ice", "twin", "hammer", "rainbow"]);
const DOG_IDS = new Set(["dachshund", "corgi", "rottweiler", "dane", "pug", "husky", "dalmatian", "poodle", "shepherd", "beagle"]);
const ACC_IDS = new Set(["bowtie", "party", "shades", "bandana", "gradcap", "cape", "pirate", "wizard", "scarf", "crown"]);
const GADGET_IDS = new Set(["laser", "rockets", "ice", "armour", "mega"]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const PLAYER_ID = /^p[0-9a-f]{16}$/;
const MAX_BODY = 40000;
const MAX_SAVE = 32000;
const CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L, easy to read out
const MAX_DEVICES = 8;
const BOARD_SIZE = 100;
const CHALLENGE_DAYS = 14;

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const num = (v, min, max) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));
const cleanName = v => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20) || "Mystery Robot";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// A robot's battle dog, if it has one.
function cleanDog(d) {
  if (!d || typeof d !== "object" || !DOG_IDS.has(d.breed)) return null;
  const name = String(d.name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 14) || "Good Dog";
  return { breed: d.breed, gadget: GADGET_IDS.has(d.gadget) ? d.gadget : null, acc: ACC_IDS.has(d.acc) ? d.acc : null, level: num(d.level, 1, 10), name };
}

// A robot as other players will see and fight it.
function cleanBuild(b) {
  b = b && typeof b === "object" ? b : {};
  const parts = [...new Set((Array.isArray(b.parts) ? b.parts : []).filter(p => PART_IDS.has(p)))].slice(0, 3);
  const c = b.colors && typeof b.colors === "object" ? b.colors : {};
  const colors = {};
  for (const k of ["body", "head", "limbs"]) colors[k] = HEX.test(c[k]) ? c[k] : "#9AA6B2";
  const src = b.lvs && typeof b.lvs === "object" ? b.lvs : {};
  const lvs = {};
  for (const p of parts) lvs[p] = num(src[p], 1, 10);
  return { name: cleanName(b.name), level: num(b.level, 1, 20), parts, colors, lvs,
           style: STYLE_IDS.has(b.style) ? b.style : "classic", weapon: WEAPON_IDS.has(b.weapon) ? b.weapon : null,
           gun: GUN_IDS.has(b.gun) ? b.gun : null, vehicle: VEHICLE_IDS.has(b.vehicle) ? b.vehicle : null, dog: cleanDog(b.dog) };
}

async function auth(store, id, token) {
  if (typeof id !== "string" || !PLAYER_ID.test(id)) return null;
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const key = `players/${id}`;
  const hash = await sha256(token);
  const rec = await store.get(key, { type: "json" });
  if (!rec) return { key, rec: { id, tokenHash: hash, created: Date.now() }, isNew: true };
  if (rec.tokenHash !== hash && !(Array.isArray(rec.tokenHashes) && rec.tokenHashes.includes(hash))) return null;
  return { key, rec, isNew: false };
}

async function readAll(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const rows = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })));
  return rows.filter(Boolean);
}

// Compares hashes so the check takes the same time whatever was typed.
async function isAdmin(key) {
  const real = (globalThis.Netlify?.env?.get("ADMIN_KEY") ?? process.env.ADMIN_KEY ?? "").trim();
  if (real.length < 8 || typeof key !== "string" || key.length > 200) return false;
  return (await sha256("mc-admin:" + key.trim())) === (await sha256("mc-admin:" + real));
}

const normCode = c => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function newCode() {
  const a = new Uint8Array(6); crypto.getRandomValues(a);
  return [...a].map(b => CODE_ABC[b % CODE_ABC.length]).join("");
}
function newToken() {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function removePlayer(store, id) {
  const rec = await store.get(`players/${id}`, { type: "json" });
  if (rec?.codeHash) await store.delete(`codes/${rec.codeHash}`);
  await store.delete(`saves/${id}`);
  const { blobs: mine } = await store.list({ prefix: `in/${id}/` });
  const { blobs: sent } = await store.list({ prefix: `out/${id}/` });
  const keys = [`players/${id}`, ...mine.map(b => b.key), ...sent.map(b => b.key),
                ...mine.map(b => `out/${b.key.split("/")[2]}/${id}`), ...sent.map(b => `in/${b.key.split("/")[2]}/${id}`)];
  await Promise.all(keys.map(k => store.delete(k)));
}

const fresh = c => Date.now() - (c.created || 0) < CHALLENGE_DAYS * 864e5;

export default async (req) => {
  const route = new URL(req.url).pathname.replace(/^\/api\/?/, "");
  if (route === "ping") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: "Too much data." }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "Bad JSON." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Bad request." }, 400);

  const store = getStore({ name: "merge-champion", consistency: "strong" });

  if (route === "admin") {
    if (!(await isAdmin(body.adminKey))) return json({ error: "Wrong key." }, 403);
    if (body.op === "check") return json({ ok: true });
    if (body.op === "remove") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(i => typeof i === "string" && PLAYER_ID.test(i)).slice(0, 100);
      for (const id of ids) await removePlayer(store, id);
      return json({ ok: true, removed: ids.length });
    }
    return json({ error: "Unknown admin action." }, 400);
  }

  // Sign this phone in as an existing player, using their profile code.
  if (route === "login") {
    const code = normCode(body.code);
    if (code.length !== 6) return json({ error: "Codes have 6 letters and numbers." }, 400);
    const link = await store.get(`codes/${await sha256(code)}`, { type: "json" });
    const rec = link && await store.get(`players/${link.id}`, { type: "json" });
    if (!rec) return json({ error: "No robot has that code." }, 404);
    const token = newToken();
    rec.tokenHashes = [...(Array.isArray(rec.tokenHashes) ? rec.tokenHashes : []), await sha256(token)].slice(-MAX_DEVICES);
    await store.setJSON(`players/${rec.id}`, rec);
    const saved = await store.get(`saves/${rec.id}`, { type: "json" });
    return json({ ok: true, id: rec.id, token, save: saved?.save ?? null, savedAt: saved?.savedAt ?? 0 });
  }

  const me = await auth(store, body.id, body.token);
  if (!me) return json({ error: "Not allowed." }, 403);
  const now = Date.now();
  const claimIdentity = async () => { if (me.isNew) { await store.setJSON(me.key, me.rec); me.isNew = false; } };

  switch (route) {
    case "state": {
      const players = await readAll(store, "players/");
      const board = players
        .filter(p => p.score)
        .map(p => ({ id: p.id, ...p.score }))
        .sort((a, b) => b.wins - a.wins || b.level - a.level || b.upgrades - a.upgrades)
        .slice(0, BOARD_SIZE);
      const incoming = (await readAll(store, `in/${me.rec.id}/`)).filter(c => c.status === "pending" && fresh(c));
      const outgoing = (await readAll(store, `out/${me.rec.id}/`)).filter(fresh);
      return json({ board, incoming, outgoing });
    }

    case "score": {
      const s = body.score && typeof body.score === "object" ? body.score : {};
      const b = cleanBuild(s);
      me.rec.score = { name: b.name, level: b.level, parts: b.parts, colors: b.colors, style: b.style, weapon: b.weapon, gun: b.gun, vehicle: b.vehicle, dog: b.dog,
                       wins: num(s.wins, 0, 999999), upgrades: num(s.upgrades, 0, 1000), updated: now };
      await store.setJSON(me.key, me.rec);
      return json({ ok: true });
    }

    case "cloudsave": {
      if (!body.save || typeof body.save !== "object" || Array.isArray(body.save)) return json({ error: "Bad save." }, 400);
      const text = JSON.stringify(body.save);
      if (text.length > MAX_SAVE) return json({ error: "Save too big." }, 413);
      await claimIdentity();
      await store.setJSON(`saves/${me.rec.id}`, { save: body.save, savedAt: num(body.savedAt, 0, 1e13) || now });
      return json({ ok: true });
    }

    case "cloudload": {
      const saved = me.isNew ? null : await store.get(`saves/${me.rec.id}`, { type: "json" });
      return json({ save: saved?.save ?? null, savedAt: saved?.savedAt ?? 0, hasCode: !!me.rec.codeHash });
    }

    case "code": {
      // Make (or replace) this player's profile code. The old code stops working.
      await claimIdentity();
      if (me.rec.codeHash) await store.delete(`codes/${me.rec.codeHash}`);
      let code, hash;
      for (let i = 0; i < 5; i++) {
        code = newCode(); hash = await sha256(code);
        if (!(await store.get(`codes/${hash}`))) break;
      }
      await store.setJSON(`codes/${hash}`, { id: me.rec.id, created: now });
      me.rec.codeHash = hash;
      await store.setJSON(me.key, me.rec);
      return json({ ok: true, code });
    }

    case "reset": {
      // Starting over takes the robot off the board but keeps the player's profile code.
      if (!me.isNew) { delete me.rec.score; await store.setJSON(me.key, me.rec); }
      return json({ ok: true });
    }

    case "challenge": {
      const to = body.to;
      if (typeof to !== "string" || !PLAYER_ID.test(to) || to === me.rec.id) return json({ error: "Pick another player." }, 400);
      const target = await store.get(`players/${to}`, { type: "json" });
      if (!target) return json({ error: "That player isn't here." }, 404);
      const existing = await store.get(`in/${to}/${me.rec.id}`, { type: "json" });
      if (existing && existing.status === "pending" && fresh(existing)) return json({ ok: true, already: true });
      await claimIdentity();
      const c = { from: me.rec.id, to, status: "pending", fromBuild: cleanBuild(body.build), created: now, updated: now, claimed: false };
      await store.setJSON(`in/${to}/${me.rec.id}`, c);
      await store.setJSON(`out/${me.rec.id}/${to}`, c);
      return json({ ok: true });
    }

    case "resolve":
    case "decline": {
      const from = body.from;
      if (typeof from !== "string" || !PLAYER_ID.test(from)) return json({ error: "Bad challenge." }, 400);
      const c = await store.get(`in/${me.rec.id}/${from}`, { type: "json" });
      if (!c || c.status !== "pending") return json({ error: "That challenge is finished." }, 404);
      await claimIdentity();
      c.updated = now;
      if (route === "resolve") {
        c.status = "done";
        c.winner = body.won === true ? me.rec.id : from;
        c.toName = cleanName(body.toName);
      } else {
        c.status = "declined";
      }
      await store.setJSON(`in/${me.rec.id}/${from}`, c);
      await store.setJSON(`out/${from}/${me.rec.id}`, c);
      return json({ ok: true });
    }

    case "claim": {
      const to = body.to;
      if (typeof to !== "string" || !PLAYER_ID.test(to)) return json({ error: "Bad challenge." }, 400);
      const c = await store.get(`out/${me.rec.id}/${to}`, { type: "json" });
      if (!c || c.claimed || (c.status !== "done" && c.status !== "declined")) return json({ ok: true });
      c.claimed = true;
      await store.setJSON(`out/${me.rec.id}/${to}`, c);
      await store.setJSON(`in/${to}/${me.rec.id}`, c);
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown route." }, 404);
  }
};

export const config = {
  path: "/api/*",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
