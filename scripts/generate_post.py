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

import json
import os
import re
import sys
from datetime import date

import requests

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
REPO_ROOT = os.environ.get("REPO_ROOT", ".")

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


def generate_post():
    resp = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1",
            "tools": [{"type": "web_search_preview"}],
            "input": PROMPT,
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
    article = generate_post()
    slug = f"blog-{today_str}-{slugify(article['title'])}"
    print("Generated title:", article["title"])
    write_post_page(article, slug)
    update_blog_listing(article, slug)
    update_sitemap(slug)
    print("Done.")
