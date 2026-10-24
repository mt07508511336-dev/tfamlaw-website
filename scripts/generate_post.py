"""
Thompson Family Law — Daily Blog Post Generator (OpenAI version)
==================================================================
What this does, in plain English:
  1. Asks OpenAI to search the web for a genuine, recent Scottish/UK
     family or civil law news topic.
  2. Asks it to write an ORIGINAL commentary post in Thompson Family
     Law's voice.
  3. Creates a new page for that post using the site's existing design.
  4. Adds a new card for it at the top of blog.html, and removes the
     oldest card if there are more than 9, to keep the page tidy.
  5. Adds the new post's web address to sitemap.xml, so Google finds
     it faster.

This script only edits files on disk — a separate step in the GitHub
Action commits and pushes those changes, which is what makes them go
live on Netlify.
"""

import glob
import html as html_lib
import json
import os
import re
import sys
from datetime import date
from difflib import SequenceMatcher

import requests

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
REPO_ROOT = os.environ.get("REPO_ROOT", ".")

# How many past headlines to show the AI so it avoids repeating them.
RECENT_POSTS_TO_CHECK = 60
# How many times to ask for a fresh topic before giving up for the day.
MAX_ATTEMPTS = 3

# Common words ignored when comparing headlines, so that two headlines
# only count as "the same" if they share the words that matter.
STOP_WORDS = {
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
    "by", "at", "from", "as", "is", "are", "be", "its", "it", "what",
    "you", "your", "need", "know", "new", "this", "that", "into", "over",
    "scottish", "scotland", "scots", "uk", "government", "court",
    "proposes", "proposed", "announces", "seeks", "launches", "step",
    "towards", "how", "why", "means", "understanding", "set", "law", "laws",
    "legal",
}

PROMPT = """You are writing a blog post for Thompson Family Law, a family-run
Scottish solicitors' firm with offices in Glasgow (Bishopbriggs), Edinburgh,
Coatbridge and Airdrie. They handle Family Law, Civil Disputes and Legal Aid.

Step 1: Search the web for a genuine, recent (last few days) news story or
development relevant to Scottish or UK family law, civil law, or legal aid.

Step 2: Write an ORIGINAL commentary blog post (350-450 words) about that
topic, in Thompson Family Law's voice: warm, direct, practical, no legal
jargon left unexplained. Do NOT copy sentences from any source — write it
entirely in your own words. You may include at most one short quote under
15 words, only if genuinely necessary, with attribution.

Return ONLY valid JSON (no markdown, no code fences) with exactly these
fields:
{
  "title": "a short, human, search-friendly headline (used as page title and card heading)",
  "meta_description": "under 155 characters, summarising the post",
  "summary": "a 1-2 sentence teaser for the blog listing card, under 200 characters",
  "body_html": "the full post as HTML paragraphs, e.g. <p>...</p><p>...</p>. Do not include the title as a heading inside this - just the paragraphs."
}"""

AVOID_REPEATS = """

IMPORTANT - AVOID REPEATS: We have ALREADY published posts with the
headlines listed below. Do NOT write about any of these stories or topics
again, even from a different angle or with a reworded headline. Pick a
clearly DIFFERENT news story or development. If the big story of the week
is already covered below, choose a smaller, different story instead.

Already published:
{titles}"""


def get_recent_titles(limit=RECENT_POSTS_TO_CHECK):
    """Read the headlines of the most recent published posts."""
    files = sorted(glob.glob(os.path.join(REPO_ROOT, "blog-*.html")), reverse=True)
    titles = []
    for path in files[:limit]:
        with open(path, encoding="utf-8") as f:
            match = re.search(r"<h1[^>]*>(.*?)</h1>", f.read(), re.DOTALL)
        if match:
            titles.append(html_lib.unescape(match.group(1)).strip())
    return titles


def key_words(title):
    words = re.findall(r"[a-z0-9]+", title.lower())
    out = set()
    for w in words:
        if w in STOP_WORDS or len(w) <= 2:
            continue
        # Treat "increase", "increases", "increased" etc. as the same word.
        for ending in ("ing", "ed", "es", "s"):
            if w.endswith(ending) and len(w) - len(ending) >= 4:
                w = w[: -len(ending)]
                break
        out.add(w.rstrip("e"))
    return out


def find_similar(new_title, old_titles):
    """Return the old headline the new one is too close to, or None."""
    new_norm = " ".join(re.findall(r"[a-z0-9]+", new_title.lower()))
    new_words = key_words(new_title)
    for old in old_titles:
        old_norm = " ".join(re.findall(r"[a-z0-9]+", old.lower()))
        if SequenceMatcher(None, new_norm, old_norm).ratio() >= 0.7:
            return old
        old_words = key_words(old)
        if new_words and old_words:
            overlap = len(new_words & old_words) / min(len(new_words), len(old_words))
            if overlap >= 0.6 and len(new_words & old_words) >= 2:
                return old
    return None


def slugify(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:60].rstrip("-")


def extract_output_text(data):
    """Pull the plain text out of an OpenAI Responses API result,
    regardless of how many tool-call steps came before it."""
    texts = []
    for item in data.get("output", []):
        if item.get("type") == "message":
            for block in item.get("content", []):
                if block.get("type") == "output_text":
                    texts.append(block.get("text", ""))
    return "\n".join(texts).strip()


def generate_post(avoid_titles):
    prompt = PROMPT
    if avoid_titles:
        prompt += AVOID_REPEATS.format(titles="\n".join(f"- {t}" for t in avoid_titles))
    resp = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1",
            "tools": [{"type": "web_search_preview"}],
            "input": prompt,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()

    raw_text = extract_output_text(data)
    raw_text = raw_text.replace("```json", "").replace("```", "").strip()

    try:
        post = json.loads(raw_text)
    except json.JSONDecodeError:
        print("Could not parse OpenAI's response as JSON. Raw response was:")
        print(raw_text)
        sys.exit(1)

    for field in ("title", "meta_description", "summary", "body_html"):
        if field not in post:
            print(f"Missing '{field}' in OpenAI's response: {post}")
            sys.exit(1)

    return post


def write_post_page(post, slug):
    template_path = os.path.join(REPO_ROOT, "templates", "post_template.html")
    with open(template_path) as f:
        template = f.read()

    date_display = date.today().strftime("%-d %B %Y")

    html = template
    html = html.replace("{{TITLE}}", post["title"])
    html = html.replace("{{META_DESCRIPTION}}", post["meta_description"])
    html = html.replace("{{SLUG}}", slug)
    html = html.replace("{{DATE_DISPLAY}}", date_display)
    html = html.replace("{{BODY_HTML}}", post["body_html"])

    out_path = os.path.join(REPO_ROOT, f"{slug}.html")
    with open(out_path, "w") as f:
        f.write(html)
    print("Wrote post page:", out_path)


def update_blog_listing(post, slug):
    blog_path = os.path.join(REPO_ROOT, "blog.html")
    with open(blog_path) as f:
        blog_html = f.read()

    date_display = date.today().strftime("%-d %B %Y")

    new_card = f'''      <div class="card">
        <p class="form-note">{date_display}</p>
        <h3>{post["title"]}</h3>
        <p>{post["summary"]}</p>
        <a class="card-link" href="{slug}.html">Read more &rarr;</a>
      </div>

'''

    marker = '    <div class="grid grid--3">\n\n'
    if marker not in blog_html:
        print("Could not find the blog grid marker in blog.html — aborting listing update.")
        sys.exit(1)

    blog_html = blog_html.replace(marker, marker + new_card, 1)

    cards = re.findall(r'      <div class="card">.*?</div>\n\n', blog_html, re.DOTALL)
    if len(cards) > 9:
        for old_card in cards[9:]:
            blog_html = blog_html.replace(old_card, "", 1)

    with open(blog_path, "w") as f:
        f.write(blog_html)
    print("Updated blog.html listing")


def update_sitemap(slug):
    sitemap_path = os.path.join(REPO_ROOT, "sitemap.xml")
    with open(sitemap_path) as f:
        sitemap = f.read()

    new_entry = f'''  <url>
    <loc>https://www.tfamlaw.co.uk/{slug}.html</loc>
    <priority>0.6</priority>
  </url>
</urlset>'''

    if "</urlset>" not in sitemap:
        print("Could not find </urlset> in sitemap.xml — skipping sitemap update.")
        return

    sitemap = sitemap.replace("</urlset>", new_entry, 1)

    with open(sitemap_path, "w") as f:
        f.write(sitemap)
    print("Updated sitemap.xml with new post")


if __name__ == "__main__":
    today_str = date.today().isoformat()
    recent_titles = get_recent_titles()
    print(f"Checking against {len(recent_titles)} recent headlines")

    article = None
    avoid = list(recent_titles)
    for attempt in range(1, MAX_ATTEMPTS + 1):
        candidate = generate_post(avoid)
        clash = find_similar(candidate["title"], recent_titles)
        if not clash:
            article = candidate
            break
        print(f"Attempt {attempt}: '{candidate['title']}' is too close to "
              f"'{clash}' - asking for a different topic")
        avoid.insert(0, candidate["title"])

    if article is None:
        print("Could not find a fresh topic today - skipping rather than "
              "publishing a repeat. No changes made.")
        sys.exit(0)

    slug = f"blog-{today_str}-{slugify(article['title'])}"
    print("Generated title:", article["title"])
    write_post_page(article, slug)
    update_blog_listing(article, slug)
    update_sitemap(slug)
    print("Done.")
