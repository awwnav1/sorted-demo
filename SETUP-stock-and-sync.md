# Stock tracking and shared sync, setup notes

## What is already live
- Receipts now feed a house stock. The Household tab shows three new sections: **In the house** (fresh ingredients), **Snacks and treats**, and **Household and baby supplies**.
- The stock lives in `data.js` under `stock`. Full purchase history lives in `data/receipts.json`, which is the engine for reorder prediction.
- To log a new shop: send Claude the receipt (photo or PDF), say "new receipt", and Claude updates `stock` and appends to `receipts.json`.

## Reorder prediction (non-food)
- Each shop is dated in `receipts.json`. Once an item has been bought 2 to 3 times, Claude works out the typical gap between buys and estimates when you will run low.
- Items predicted to run low get a `due` date on their entry in `stock.household`; the app shows those in amber and they go onto the next shop.
- Best for steady-use items: wipes, formula, sterilising fluid, foil, cling film. Lumpy or one-off items are not flagged.

## To turn on shared review sync (two steps, both yours)

### 1. Add the missing `api` folder to GitHub
GitHub's web uploader skipped the `api` folder, which is why `/api/state` returns 404.
- Go to the repo: github.com/your-account/sorted-demo
- **Add file > Create new file**
- In the name box type: `api/state.js` (the slash creates the folder)
- Paste the contents of the local `family-planner/api/state.js`
- **Commit changes**. Vercel redeploys automatically.

### 2. Connect Upstash Redis on Vercel
- Vercel > project `sorted-demo` > **Storage** tab
- **Create / Connect Database** > choose **Upstash** (Redis)
- Accept the terms and create the database (these are the steps Claude cannot do for you)
- **Connect** it to the `sorted-demo` project, then redeploy
- The dot in the app header turns green when sync is live

### Optional: lock the API
- Add a Vercel environment variable `PLANNER_KEY` with a passphrase. If you do, tell Claude so it can be wired in.

## Once both are done
- Send Claude the app URL and it will fetch `/api/state`, confirm it can read the saved review, and plan from it.
- Either you or Tom can then fill in the Sunday review from any phone and it collates into one shared record.
