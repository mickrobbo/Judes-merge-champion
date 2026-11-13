<img src="brand/logo.png" alt="Jude's Merge Champion" width="520">

# Jude's Merge Champion

A robot building and battle game designed by Jude (age 8).

Build your own robot from everyday parts, paint it, give it a name, then battle computer robots to win gold coins. Spend coins to upgrade parts from level 1 to 10. Level your robot up to unlock 10 Power Parts, two at a time.

**Play:** https://mickrobbo.github.io/judes-merge-champion/

- The whole game is one file: `index.html`.
- Progress (coins, parts, upgrades) saves in the browser on each device.
- On Netlify, the leaderboard and player challenges run on a small server function, `netlify/functions/api.mjs`, which stores players and challenges in Netlify Blobs. Each device becomes a player automatically: no logins.
- On GitHub Pages there is no server, so the game plays fully but the leaderboard shows a note instead.

## Looking after the leaderboard

Players and challenges are in **Netlify → Data & Storage → Blobs → `merge-champion`**. To remove a robot (for example a rude name), delete its `players/<id>` entry there.

## Installing as an app

The Netlify site is an installable web app. In Chrome on a phone, open the site and tap **Install** (or ⋮ → **Install app** / **Add to Home screen**). It opens full screen with its own icon and still loads without internet; the leaderboard needs a connection.

- `manifest.webmanifest` – app name, colours and icons.
- `sw.js` – offline support. Bump `CACHE` when you want installed copies to refresh their saved files.
- `icons/` – app icons (normal, maskable for Android, Apple touch icon, favicon).
- `brand/` – the logo (`logo.svg`, `logo.png`).

## Adding to the game

Open `index.html` and look near the top of the `<script>`:

- `OBJECTS` – the parts. Add one here plus an icon in `ICONS`.
- `SPECIALS` – what each part's special move does.
- `COMBOS` – secret combos.
- `WEAPONS` – laser swords (colour, stats, price, special move). Their special moves are in `SPECIALS` too.
- `STYLES` – robot styles (Classic, Star Knight, Shadow Lord, Rocket Pilot, Scrap Scout, Commando), drawn in `robotSVG`.
- `GUNS` – blasters for the FIRE! button (ammo per battle); what each one does is in `GUN_FIRE`.
- `VEHICLES` – transform forms (tank, race car, jet, rocket), unlocked by robot level; their attacks are in `VEHICLE_ATTACK` and drawings in `vehicleSVG`.
- The economy constants (coin rewards, upgrade cost, XP per level) sit just above.

## Removing old players

The leaderboard has a **Manage** button that only the game's manager sees.

- **Website:** open the game with `#admin` on the end of the address (for example `https://judes-merge-champion.netlify.app/#admin`) and type the manager key. The key is the `ADMIN_KEY` environment variable in Netlify (Project configuration → Environment variables). The device remembers it; open `#admin` again to make it forget.
- **Claude version:** the artifact's owner sees Manage automatically.

Each removal needs a second tap to confirm. There is also a button that removes everyone not seen for 30 days. A removed player who plays again comes back on the board.

## Profiles (website)

Each robot saves to the game server as well as the phone. The **Player** panel in the garage shows:

- **Profile code:** a 6-character code. Type it on another phone ("I have a code") to play the same robot there. Progress syncs both ways; the newest save wins.
- **Other players on this phone:** switch between robots. With more than one, the game asks "Who's playing?" when it opens.
- **New player:** starts a fresh robot without losing the current one.

Making a new code stops the old one working. Phones already signed in stay signed in.

## Battle dogs

The **Kennel** (menu → Kennel) has ten dogs, each with its own power: Dachshund, Corgi, Rottweiler, Great Dane, Pug, Husky, Dalmatian, Poodle, German Shepherd and Beagle. The first dog is free; more cost 25 coins. A dog bites after each of your turns and levels up (to 10) from battle XP. Gadgets (Laser Collar, Rocket Pack, Ice Collar, Battle Armour, Mega Bark) are bought once and fitted one at a time; the dog uses its gadget every 3rd turn. Ten **accessories** (`ACCS`) are worn one at a time and each gives a small perk. Add breeds to `DOGS` (plus a drawing in `dogSVG`) and gadgets to `GADGETS` (plus `DOG_GADGET` and `gadgetIcon`).

## Adventure, daily missions, stickers, tricks and live battles

- **Adventure map** (`WORLDS`): six worlds (Junkyard, Desert Canyon, Army Base, Frozen Peaks, Volcano, Space Station). Each has 10 stages; stage 10 is that world's boss. Beating the Space Station boss starts a tougher "Champion Lap".
- **Daily** (`MISSIONS`): three missions a day, the same on every phone for a player, plus a daily chest whose coins grow with a day streak (up to 7 days).
- **Sticker book** (`STICKERS`): 24 achievements, 3 coins each.
- **Dog tricks** (`TRICKS`): a trick slot at dog levels 3, 6 and 9.
- **Finishing moves and replays**: the last hit plays in slow motion, and the win screen can replay the best hit of the battle. Turns are run with a seed (`seededTurn`) so they can be played again exactly.
- **Live battles** (website only): players who have the game open show a green dot on the leaderboard. A live battle takes turns through the `live-*` routes in `netlify/functions/api.mjs`. Each phone sends its move, seed and the result; the other phone replays the move with the same seed and copies the result.

## Armour, holidays and updates

- **Armour** (menu → Armour): four sets (Light, Battle, Heavy, Royal) that add armour points. Pick a colour, a logo, or a letter/number for the belt buckle and shoulder pad.
- **Holiday specials** run for 3 days (the day before, the day, the day after): New Year, Australia Day, Labour Day (Vic), Easter, Anzac Day, King's Birthday, Halloween, Melbourne Cup and Christmas. You get hats, arena decorations, themed robots, +3 coins a win and a once-a-year present with an exclusive logo. Anzac Day is kept quiet and respectful. To preview one, run `localStorage.setItem('mc-holiday','christmas')` in the browser console. To stop the preview, run `localStorage.removeItem('mc-holiday')`.
- **Vehicles** have a second "super move" that can be used once each time you transform.
- **Auto-update**: the game checks `version.txt` when it's reopened. When the text differs from `BUILD` in the game, players see a "New update ready!" button. Bump both the `BUILD` value and `version.txt` (and the `sw.js` CACHE name) with each release.
