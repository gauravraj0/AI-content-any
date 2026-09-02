"""Minimal Markdown -> HTML used by exports and the in-app preview.

Supports what the generators emit: headings, bold/italic, inline code, lists,
ordered lists, tables, blockquotes, rules and links.
"""
from __future__ import annotations

import html
import re

_BULLET = re.compile(r"^\s*[-*+]\s+")
_NAMED = re.compile(r"^\s*\d+[.)]\s+")
_RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")

INLINE = [
    (re.compile(r"`([^`]+)`"), r"<code>\1</code>"),
    (re.compile(r"\*\*([^*]+)\*\*"), r"<strong>\1</strong>"),
    (re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)"), r"<em>\1</em>"),
    (re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)"),
     r'<img src="\2" alt="\1" loading="lazy" style="max-width:100%;border-radius:12px;display:block;margin:20px 0">'),
    (re.compile(r"(?<!\!)\[([^\]]+)\]\(([^)]+)\)"), r'<a href="\2">\1</a>'),
]


def _inline(text: str) -> str:
    out = html.escape(text or "")
    for pat, rep in INLINE:
        out = pat.sub(rep, out)
    return out


def to_html(md: str) -> str:
    body: list[str] = []
    lines = (md or "").split("\n")
    i, n = 0, len(lines)
    in_ul = in_ol = False

    def close_lists() -> None:
        nonlocal in_ul, in_ol
        if in_ul:
            body.append("</ul>")
            in_ul = False
        if in_ol:
            body.append("</ol>")
            in_ol = False

    while i < n:
        line = lines[i].rstrip()

        # table
        if re.match(r"^\|.*\|\s*$", line) and i + 1 < n and re.match(r"^\|[\s:|-]+\|\s*$", lines[i + 1]):
            close_lists()
            head = [c.strip() for c in line.strip("|").split("|")]
            row_html = "".join("<th>" + _inline(c) + "</th>" for c in head)
            body.append("<table><thead><tr>" + row_html + "</tr></thead><tbody>")
            i += 2
            while i < n and re.match(r"^\|.*\|\s*$", lines[i]):
                cells = [c.strip() for c in lines[i].strip("|").split("|")]
                body.append("<tr>" + "".join("<td>" + _inline(c) + "</td>" for c in cells) + "</tr>")
                i += 1
            body.append("</tbody></table>")
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            close_lists()
            lvl = len(m.group(1))
            body.append("<h%d>%s</h%d>" % (lvl, _inline(m.group(2)), lvl))
            i += 1
            continue

        if _RULE.match(line):
            close_lists()
            body.append("<hr>")
            i += 1
            continue

        if line.startswith(">"):
            close_lists()
            quote = [line.lstrip("> ").strip()]
            i += 1
            while i < n and lines[i].startswith(">"):
                quote.append(lines[i].lstrip("> ").strip())
                i += 1
            body.append("<blockquote><p>" + _inline(" ".join(quote)) + "</p></blockquote>")
            continue

        if _BULLET.match(line):
            if in_ol:
                body.append("</ol>")
                in_ol = False
            if not in_ul:
                body.append("<ul>")
                in_ul = True
            body.append("<li>" + _inline(_BULLET.sub("", line)) + "</li>")
            i += 1
            continue

        if _NAMED.match(line):
            if in_ul:
                body.append("</ul>")
                in_ul = False
            if not in_ol:
                body.append("<ol>")
                in_ol = True
            body.append("<li>" + _inline(_NAMED.sub("", line)) + "</li>")
            i += 1
            continue

        if not line.strip():
            close_lists()
            i += 1
            continue

        close_lists()
        para = [line.strip()]
        i += 1
        while i < n and lines[i].strip() and not re.match(r"^(?:#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\||>)", lines[i]):
            para.append(lines[i].strip())
            i += 1
        body.append("<p>" + _inline(" ".join(para)) + "</p>")

    close_lists()
    return "\n".join(body)


CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; background:#f6f5f1; color:#14161c;
  font:16px/1.68 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
header { background:#0b0d14; color:#fff; padding:44px 24px 30px; }
.wrap { max-width:760px; margin:0 auto; padding:0 8px; }
h1 { font-family:'Sora','Inter',system-ui,sans-serif; font-size:clamp(28px,5vw,42px); line-height:1.12;
  margin:0 0 10px; letter-spacing:-.02em; }
.meta { opacity:.6; font-size:13px; letter-spacing:.02em; }
main { background:#fff; margin:-16px auto 0; max-width:760px; border-radius:16px;
  box-shadow:0 18px 50px rgba(12,14,25,.10); padding:clamp(22px,5vw,54px); }
h2,h3 { font-family:'Sora','Inter',system-ui,sans-serif; letter-spacing:-.01em; margin:1.9em 0 .5em; }
h2 { font-size:1.5em; } h3 { font-size:1.16em; }
p { margin:0 0 1.05em; }
ul,ol { padding-left:1.25em; margin:0 0 1.1em; }
li { margin:.3em 0; }
blockquote { margin:1.4em 0; padding:.2em 0 .2em 1em; border-left:3px solid #7c5cff; color:#3d4351; font-style:italic; }
table { border-collapse:collapse; width:100%; margin:1.4em 0; font-size:15px; }
th,td { border-bottom:1px solid #e7e6e1; padding:9px 10px; text-align:left; }
th { background:#faf9f6; font-weight:600; }
code { background:#f1f0ec; padding:.12em .38em; border-radius:5px; font-size:.9em; }
hr { border:0; border-top:1px solid #e7e6e1; margin:2.2em 0; }
a { color:#5b3fe0; }
.stats { display:flex; flex-wrap:wrap; gap:20px; list-style:none; padding:0; margin:24px 0 0; color:#fff; }
.stats li { display:flex; flex-direction:column; }
.stats b { font-size:19px; font-family:'Sora',system-ui,sans-serif; }
.stats span { font-size:11px; text-transform:uppercase; letter-spacing:.09em; opacity:.6; }
footer { text-align:center; padding:34px 20px 60px; font-size:12px; color:#6b7280; }
@media print { body { background:#fff; } main { box-shadow:none; margin:0; } header { background:#fff; color:#000; } }
"""


def document_html(title: str, md: str, meta: dict | None = None) -> str:
    """Fully standalone styled HTML document (used by /api/export)."""
    meta = meta or {}
    stats = "".join(
        "<li><b>%s</b><span>%s</span></li>" % (html.escape(str(v)), html.escape(str(k).replace("_", " ")))
        for k, v in list(meta.items())[:8] if isinstance(v, (int, float, str))
    )
    desc = html.escape(str(meta.get("meta_description", ""))[:158])
    head = html.escape(str(title))
    return (
        "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>" + head + "</title>"
        "<meta name=\"description\" content=\"" + desc + "\">"
        "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>"
        "<style>" + CSS + "</style></head><body>"
        "<header><div class=\"wrap\"><h1>" + head + "</h1>"
        "<div class=\"meta\">Generated by Nebula Studio</div>"
        "<ul class=\"stats\">" + stats + "</ul></div></header>"
        "<main>" + to_html(md) + "</main>"
        "<footer>Export from Nebula Studio · nebula.studio</footer>"
        "</body></html>"
    )
