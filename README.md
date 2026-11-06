# Jude's Merge Champion

A robot building and battle game designed by Jude (age 8).

Build your own robot from everyday parts, paint it, give it a name, then battle computer robots to win gold coins. Spend coins to upgrade parts from level 1 to 10. Level your robot up to unlock 10 Power Parts, two at a time.

**Play:** https://mickrobbo.github.io/judes-merge-champion/

- Everything is in one file: `index.html`. No build step.
- Progress saves in the browser on each device.
- The leaderboard and player challenges only work in the claude.ai version of the game (`claude-artifact.html` is that source).

## Adding to the game

Open `index.html` and look near the top of the `<script>`:

- `OBJECTS` – the parts. Add one here plus an icon in `ICONS`.
- `SPECIALS` – what each part's special move does.
- `COMBOS` – secret combos.
- The economy constants (coin rewards, upgrade cost, XP per level) sit just above.
