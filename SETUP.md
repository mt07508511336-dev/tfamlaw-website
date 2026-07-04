# Daily Blog Automation for Your New Website — Setup Guide

This makes your website automatically write and publish a new, original
blog post every day — fully hands-off, using your existing Netlify site.

No coding. Roughly 20 minutes to set up, once.

---

## How it fits together

Your site currently lives on Netlify because you dragged a zip file in.
For automation to work, Netlify needs to watch a **GitHub repository**
instead — then every day, GitHub writes a new blog post file and Netlify
automatically republishes the site. This is actually the standard,
recommended way to run a Netlify site long-term anyway (easier to update,
free version history, no more re-zipping every time something changes).

---

## Part 1 — Put your website files on GitHub

1. Go to https://github.com and create a free account if you don't have one.
2. Click **+ → New repository**. Name it e.g. `tfamlaw-website`. Set it to
   **Private** or **Public** (either works). Click **Create repository**.
3. Click **Add file → Upload files**, and drag in:
   - Every file and folder from your current website (`index.html`,
     `css`, `js`, `images`, `robots.txt`, `sitemap.xml`, etc.)
   - Every file and folder from **this** automation package (`templates`,
     `scripts`, `.github`, `requirements.txt`) — dragging both sets in
     together into the same upload works fine.
4. Click **Commit changes**.

---

## Part 2 — Connect Netlify to that GitHub repository

1. Go to https://app.netlify.com/projects/thompson-family-law (your
   existing site).
2. Go to **Site configuration → Build & deploy → Continuous deployment**.
3. Look for an option like **"Link repository"** or **"Configure
   automatic deploys"** and choose GitHub, then select the
   `tfamlaw-website` repository you just created.
   - If you don't see that option on the existing site, the simplest
     alternative is: **Add new site → Import an existing project →
     Deploy with GitHub**, pick `tfamlaw-website`, and use that new
     Netlify site going forward instead (you can rename it or move your
     domain to it later — just let me know if this is the path you take).
4. Leave the build settings as default (no build command needed — it's
   a plain HTML site) and deploy.

---

## Part 3 — Get an Anthropic API key

1. Go to https://console.anthropic.com and create an account (separate
   from Claude.ai).
2. Add a small amount of credit (a few pounds covers months of daily posts).
3. Go to **API Keys → Create Key**, and copy it.

---

## Part 4 — Add the key to GitHub

1. In your `tfamlaw-website` repository, go to **Settings → Secrets and
   variables → Actions**.
2. Click **New repository secret**:
   - Name: `ANTHROPIC_API_KEY` — Value: (the key from Part 3)

---

## Part 5 — Test it

1. Go to the **Actions** tab in your repository.
2. Click **Daily Blog Post** → **Run workflow** → **Run workflow** to confirm.
3. Wait about a minute, refresh — a green tick means it worked.
4. Check your live Netlify site's Blog page in a minute or two — the new
   post should already be there, published automatically.
5. A red cross means something needs adjusting — click in to see the
   error message, or send it to Claude to help troubleshoot.
6. Once happy, leave it — it now runs itself every day at 7am UTC.

---

## Changing things later

- **Change posting time:** edit the `cron` line in
  `.github/workflows/daily-blog.yml` directly in GitHub's browser editor.
- **Change how many posts stay listed on the Blog page:** edit the number
  `9` in `scripts/generate_post.py` (search for it — one line).
- **Pause it:** Actions tab → ⋯ menu next to the workflow → Disable workflow.
- **Edit or delete a bad post:** just edit or delete that post's `.html`
  file and its card in `blog.html` directly on GitHub, then commit —
  Netlify will redeploy automatically.

---

## Costs (approximate)

- GitHub + GitHub Actions: free at this usage level
- Netlify: free tier covers a site this size
- Anthropic API: roughly £0.01-0.03 per post, so under £1/month
