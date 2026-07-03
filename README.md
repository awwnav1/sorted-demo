# Sorted (demo)

This is a demo populated with a fictional family: Maya, Tom and baby Alfie. All names, meals, events, stock and receipts are made up.

A shared weekly planner for Maya, Tom and the baby: meals, logistics (who is where, who does drop-off and pick-up), a shared shopping list and to-do list, freezer stock, the baby's food exposures, and a Sunday review that drives the next week's plan.

Built as a static site with one serverless function, designed for Vercel's free tier. Each week, Claude commits a new set of week data files and the site updates itself. Git history doubles as the week archive.

## One-time setup

1. Create a new GitHub repository (private is fine) and push this folder to it:

       cd family-planner
       git init
       git add .
       git commit -m "Family planner, week commencing 15 June 2026"
       git branch -M main
       git remote add origin https://github.com/YOUR-USERNAME/family-planner.git
       git push -u origin main

2. In Vercel: Add new project, import the repository, deploy. No build settings needed, it is a static site.

3. Shared syncing (recommended): in the Vercel dashboard open the project, go to Storage (or Marketplace), add **Upstash Redis** (free tier) and connect it to the project. The environment variables are added automatically; redeploy. The dot in the app header turns green when sync is live. Without this step the app still works, but ticks and tasks stay per device.

4. Optional: in Vercel project settings add an environment variable `PLANNER_KEY` with a passphrase to lock the API. (If set, the app needs the same key added; ask Claude to wire it in.)

5. On each phone, open the site in the browser and use "Add to home screen". It behaves like an app from then on.

## The weekly cycle

1. Through the week: tick shopping and daily actions, add tasks, note reactions to new foods.
2. Sunday: open the Review tab, set next week's work patterns, drop-offs and childminder exceptions, log what was eaten or refused and any freezer corrections. Save.
3. Tell Claude to plan next week. Claude reads the saved review (via the site's API or your notes), plans meals that fit the logistics (office days mean no packed lunch for that adult, road days mean quicker dinners), updates the inventory workbook, and commits the new week's data files to this repository. Vercel redeploys automatically.

## If the site loads but shows no content

The app's data is bundled into `data.js`, so this should not happen from version 2 onwards. If it does: hard-refresh (Ctrl+Shift+R), and check the Vercel project's Root Directory setting points at the repository root (where `index.html` lives), not a subfolder.

## Repository layout

    index.html            app shell
    style.css             design system (shared with the weekly HTML plans)
    app.js                rendering and sync logic
    manifest.webmanifest  home-screen app metadata
    api/state.js          shared state endpoint (Upstash Redis REST)
    data.js               bundled week data the app actually loads (single source of truth)
    meal-history.md       rolling record of past weeks, read for rotation each run
    data/receipts.json    purchase history, appended when a receipt is logged

## Notes

- The single source of truth for the rolling food system is `data.js`, with `meal-history.md` as the record of past weeks. `inventory.xlsx` and the dated `data/` week JSON files are retired.
- State (ticks, tasks, logistics edits, review answers) lives in Redis under one key, last write wins. Fine for a two-adult household.
- No accounts, no tracking, no third-party scripts beyond Google Fonts.
