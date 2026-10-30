# Metaphysical Field Survey

A 3D, CAD-style model of 48 philosophers and 15 religious traditions, placed by their metaphysical claims, plus a test that puts your own pins in the model.

## The three axes, and a fourth question

- **X · What is fundamental?** (left ↔ right): if you broke everything down to its most basic ingredient, would you find mind or matter?
- **Y · Where is the ultimate?** (up ↕ down): if you keep asking "but why?", where does the chain finally stop: beyond the universe, in the universe itself, or nowhere at all? This also tells you *who* would make truth, if truth is made: God's will sits high, human construction sits low.
- **Z · Is truth found or made?** (front ↔ back): are the deepest truths (logic, math, right and wrong, the order of nature) eternal and discovered, or brought into being by a will or mind? Plato, Latter-day Saint teaching and Jainism sit at the front, where truth is uncreated and binds even God. Most Christian theology sits mid-way, with truth grounded in God's nature. Voluntarists like Ockham and al-Ghazālī, and constructivists like Nietzsche, sit at the back.
- **What is the highest good?** (shown by color): what a life is ultimately for. This isn't a scale, so it's a category: union with the divine, character and flourishing, liberation and peace, happiness and wellbeing, freedom and self-creation, justice and the common good, harmony with the way of things, understanding, or achievement and success. It shows kinships the axes hide: Epicurus and the Buddhists both aim at freedom from craving and disturbance; Plato, Augustine and Latter-day Saint teaching all aim at becoming like God; Nietzsche aims at the opposite of Plato's good as well as sitting at the opposite corner of the model.

## Using the model

- **On a phone** the model starts as just the colored region blocks. Tap a block to see who sits in it, then tap a name to see who agrees with them.
- **Drag** to turn it, **shift-drag** to pan, **scroll** to zoom. On a phone, tap any point or block and the model flies to it.
- **Filters:** tabs under the view buttons show all entries, only philosophers or only religions. Points are colored by their highest good; tap a good under the model to show only the entries that aim at it.
- **View buttons:** 3D, FRONT (the classic X–Y map), SIDE (truth against the ultimate) and TOP (mind or matter against truth), plus turn and tilt.
- **Two points per thinker:** a solid point for what they claimed, and a hollow point for where their arguments actually commit them, joined by a drift arrow. Contested readings are dashed. Faded points sit farther back.
- **Seventeen regions** as translucent blocks. Each of the nine columns (Idealism, Classical Theism, Materialist Theism, Pantheism, Physicalism and so on) splits at Z 0 into a truth-found half and a truth-made half, for example Intellectualist vs Voluntarist Theism. Anti-Realism runs the full depth.
- **Focus on a selection:** select anyone and everything fades except the entries that share their view on at least one axis or their highest good. Three planes pass through their position, the three axes light up with their values, and the panel lists who agrees on each.

## Findings

The **Findings** page (button at the top, or `index.html#findings`) shows what the data reveals: which axis is tied most strongly to the highest good, how philosophy has shifted over time, how religions and philosophers differ, how ways of deciding track the axes, and a few surprising neighbours. Every chart has a table view, and tapping a dot opens that entry on the map. It ends with an honest section on how far to trust the patterns.

## The test

Thirty-six questions in seven parts. It opens in its own tab, and when you finish, a results card pops up with everything in one scrollable place; tap "Show me on the map" to see your pins in the model.

1. **How you decide** comes first. Six real-life scenarios; pick up to three answers and star the one that matters most. This places your **decision pin**, which moves up–down (where you look for guidance) and front–back (whether you act as if right and wrong are found or made).
2. **Your mind, The universe, Meaning, Truth, Found or made, and The good** place your **belief pin** and your **highest good**. The last part asks directly, mostly without mentioning God, whether truth is found or made: was 2 + 2 = 4 true before anyone counted, could the deepest truths change, are scientists discovering or inventing laws, and Plato's Euthyphro question. The last part asks what a life is for: what would make yours a good one, what stands out in a truly good person, what gets in the way, which one thing you'd keep, and why you try to be good.

### How the test was checked

Each question was answered as all 61 mapped thinkers and traditions would answer it, based on their own writings, and the results were compared with their places in the model. The test puts 43 of 61 in the correct one of 17 blocks, 46 of 61 in the correct column, and 58 of 61 on the correct side of the truth axis (average truth-axis error about 12 units). The five highest-good questions, answered independently for each entry, recover the intended good for 55 of the 56 entries that name one (Machiavelli and Ayn Rand, added later, are checked on these five questions only). Counting the good, 44 of 61 entries find themselves in their own top three matches (up from 38 on the axes alone). The page's scoring was checked against the validation harness on all 61 answer sheets.

## Collecting results (no login)

When someone finishes the test on the live site, they're asked whether to add their answers to the research. Nothing is sent unless they tick "I'm 18 or older, and I agree to share my answers anonymously". They can also pick their religious tradition (optional).

- **Stored:** answers, belief and decision pins, highest good, chosen tradition, time taken, and a random code kept in their browser so a retake links to their earlier result.
- **Never stored:** names, emails, accounts or IP addresses (addresses are only held in memory for a few minutes to stop spam).
- **Seeing results:** go to `/results` on the live site. The username can be anything; the password is `ADMIN_KEY`. The page shows the goods people aim at, whether the map's main finding holds for real people, how widely members of one faith spread on each axis, belief–decision gaps, retakes, and a CSV download.

The Desktop copy and the claude.ai preview never send anything; the share step only appears when the page is served by `server.js` with a database connected.

### Sharing a result

The results card shows an identity title for the belief pin's region (for example "Eternal-Law Materialist"). On the live site, **Share my results** makes a link (with an optional first name) that opens straight to that person's card, with buttons to see them on the map or take the test. The result lives in the link itself, so nothing extra is stored, and `server.js` adds a preview title like "Jared is an Eternal-Law Materialist" for iMessage and other apps.

### Railway setup

1. In the Railway project, click **+ Create → Database → PostgreSQL**.
2. Open the web service → **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `ADMIN_KEY` = a long password of your choice
3. Push this repo. Railway runs `npm start` (`node server.js`), which creates the table on first start.
4. Visit `https://<your-site>/api/health`. It should say `"collecting":true`.

## Running it

Open `index.html` in any browser for the map and test (no build step). To run the server locally: `npm install`, then `DATABASE_URL=postgres://... ADMIN_KEY=secret npm start`.

## A note on accuracy

Coordinates are interpretive judgments grounded in each thinker's own writing and the main scholarly readings, not measurements. Where serious scholars disagree, the model says so.
