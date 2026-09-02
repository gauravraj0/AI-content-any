"""Small deterministic NLP toolkit used by the generation engine.

Pure stdlib only, so the API boots with zero model downloads while still
giving the engine real signal (phrase extraction, readability, sentence
scoring) instead of dumb string templates.
"""
from __future__ import annotations

import hashlib
import math
import re

STOPWORDS = set("""a about above after again against all am an and any are aren as at be because been before being below
between both but by can cannot could couldn did do does doing don down during each few for from further had hadn has
haven he her here hers herself him himself his how i if in into is it its itself just me more most must my myself no nor
not now of off on once only or other ought our ours ourselves out over own same shan she should shouldn so some such than
that the their theirs them themselves then there these they this those through to too under until very was we were what
when where which while who whom why will with you your yours yourself wouldn also get got like really very quite things
thing using use used please make made many much lot bit need wants want said says per via both every any more most
· — -""".split())

EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002190-\U000021FF\U00002B00-\U00002BFF\uFE0F\u200D]+"
)
WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’&+/#-]*")
SENT_RE = re.compile(r"(?<=[.!?…])\s+|\n{2,}")

CONTENT_TYPES = (r"(?:blog\s+post|blog\s+article|blog|article|post|social\s+caption|captions?|caption|"
                 r"email|newsletter|ad\s+copy|ads?|product\s+description|description|summary|paragraph|"
                 r"script|video\s+script|landing\s+page|copy|announcement|launch\s+note)")
INTENT_VERBS = r"(?:write|create|generate|draft|make|produce|give\s+me|i\s+need|need|i\s+want|help\s+me\s+write)"

# Literal words that describe the *task*, never the subject of the article.
CONTENT_TYPE_WORDS = {
    "write", "create", "generate", "draft", "drafts", "make", "produce", "give", "need", "want", "help",
    "blog", "blogs", "post", "posts", "article", "articles", "newsletter", "email", "emails", "caption",
    "captions", "ad", "ads", "copy", "description", "summary", "paragraph", "paragraphs", "script",
    "announcement", "note", "social", "intro", "intros", "piece", "pieces", "brief", "briefs",
    "section", "sections", "snippet", "blurb", "outline", "headline", "headlines", "tagline",
    "landing", "page", "an", "a", "the", "some", "couple",
}

# Audience / qualifier phrases: useful in the brief, wrong in the headline keyword.
AUDIENCE_WORDS = {
    "for", "with", "and", "or", "of", "to", "in", "on", "about", "that", "this", "your", "our", "we", "they",
    "why", "how", "does", "do", "not", "it", "is", "are", "be", "being", "been", "team", "teams", "client",
    "clients", "startup", "startups", "agency", "agencies", "founder", "founders", "publisher", "publishers",
    "marketing", "lean", "small", "busy", "solo", "early", "stage", "new", "their", "audience", "smb",
}

NOISE_TOKENS = CONTENT_TYPE_WORDS | AUDIENCE_WORDS | set(STOPWORDS) | {"my", "our", "your"}


ACRONYMS = {"ai": "AI", "seo": "SEO", "api": "API", "apis": "APIs", "ux": "UX", "ui": "UI",
            "ml": "ML", "gpt": "GPT", "llm": "LLM", "llms": "LLMs", "b2b": "B2B", "b2c": "B2C",
            "sms": "SMS", "crm": "CRM", "saas": "SaaS", "roi": "ROI", "cta": "CTA", "faq": "FAQ",
            "ppc": "PPC", "ugc": "UGC", "tiktok": "TikTok", "pdf": "PDF", "cms": "CMS",
            "utm": "UTM", "serp": "SERP", "ctr": "CTR", "ecom": "e-com"}


# ---------------------------------------------------------------- primitives
def tokenize(text: str) -> list[str]:
    return [w.lower().strip("'’") for w in WORD_RE.findall(text or "")]


def sentences(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(SENT_RE, (text or "").strip()) if p.strip()]
    return [re.sub(r"\s+", " ", p) for p in parts]


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", (word or "").lower())
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]{1,2}", w)))


def readability(text: str) -> dict:
    """Flesch Reading Ease + grade level plus simple counts."""
    plain = re.sub(r"[#*>`_|\-]{1,}", " ", text or "")
    plain = re.sub(r"\|[^|]*\|[^|]*\|", " ", plain)          # drop table rows
    sents = [s for s in sentences(plain) if len(tokenize(s)) >= 3]
    words = tokenize(plain)
    scount, wcount = max(1, len(sents)), max(1, len(words))
    syl = sum(syllables(w) for w in words)
    fre = 206.835 - 1.015 * (wcount / scount) - 84.6 * (syl / wcount)
    fg = 0.39 * (wcount / scount) + 11.8 * (syl / wcount) - 15.59
    return {
        "words": len(words),
        "sentences": len(sents),
        "paragraphs": len([p for p in re.split(r"\n\s*\n", text or "") if p.strip()]),
        "reading_time_min": max(1, round(len(words) / 225)),
        "flesch": round(max(0.0, min(100.0, fre)), 1),
        "grade": round(fg, 1),
    }


def key_terms(text: str, min_len: int = 3) -> list[tuple[str, int]]:
    freq: dict[str, int] = {}
    for w in tokenize(text):
        if len(w) < min_len or w in STOPWORDS or w.isdigit():
            continue
        freq[w] = freq.get(w, 0) + 1
    return sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))


def ngrams(text: str, n_range: tuple[int, int] = (1, 3), top: int = 12) -> list[dict]:
    """Weighted multi-word phrases; repeated longer phrases outrank stray words."""
    toks = tokenize(text)
    counts: dict[str, int] = {}
    for n in range(n_range[0], n_range[1] + 1):
        for i in range(len(toks) - n + 1):
            gram = toks[i:i + n]
            if any(t in STOPWORDS or len(t) < 3 for t in gram):
                continue
            phrase = " ".join(gram)
            counts[phrase] = counts.get(phrase, 0) + n * n
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"phrase": p, "weight": w} for p, w in ranked[:top]]


def fix_acronyms(text: str) -> str:
    """Keep domain acronyms cased correctly so titles never read as 'Ai Content'."""
    def rep(m: re.Match) -> str:
        w = m.group(0)
        return ACRONYMS.get(w.lower(), w)
    return re.sub(r"[A-Za-z][A-Za-z0-9&+-]*", rep, text or "")


def article(word: str) -> str:
    return "an" if re.match(r"^[aeiouAEIOU]|^[A-Z]{2}", word or "") else "a"


def fix_articles(text: str) -> str:
    """Repair a/an agreement, which template stitching likes to break."""
    def rep(m: re.Match) -> str:
        article_word, next_word = m.group(1), m.group(2)
        want = article(next_word)
        fixed = want if article_word[0].islower() else want.title()
        return fixed + " " + next_word
    return re.sub(r"\b(a|an)\s+([A-Za-z0-9'\u2019-]+)", rep, text or "")


def _drop_noise_edges(text: str) -> str:
    """Strip task words from the front and back: 'intro on why' / 'pricing page copy'."""
    words = text.split()
    while words and words[0].lower().strip(".,;:!?") in CONTENT_TYPE_WORDS | {"on", "about", "for", "why", "to", "our", "my", "this"}:
        if len(words) <= 2:
            break
        words = words[1:]
    while words and words[-1].lower().strip(".,;:!?") in CONTENT_TYPE_WORDS and len(words) > 2:
        words = words[:-1]
    return " ".join(words)


def topic_of(prompt: str, fallback: str = "your product") -> str:
    """Subject phrase of a brief.

    'write a blog post about AI content workflows for lean teams' -> 'AI content workflows'
    'seo brief on b2b pricing page copy' -> 'b2b pricing page'
    """
    text = re.sub(r"\s+", " ", (prompt or "").strip()).strip(" .,:;-!?")
    if not text:
        return fallback
    text = re.sub(r"^" + INTENT_VERBS + r"\b\s*(?:me\s+)?(?:an?\s+|the\s+|some\s+|a\s+couple\s+of\s+)?", "", text, flags=re.I)
    # word-count and length instructions are not the subject
    text = re.sub(r"^\d+\s*[-\u2013]?\s*(?:words?|characters?|chars?|minutes?|mins?|sections?|paragraphs?)\b\s*", "", text, flags=re.I)
    text = re.sub(r"^\d+\s+(?:bullet|idea|example|tip|step)s?\s+(?:about|on|for)?\s*", "", text, flags=re.I)
    # 'write me a LinkedIn post announcing X' -> X
    text = re.sub(r"^(?:an?\s+|the\s+)?(?:linkedin|instagram|tiktok|twitter|facebook|youtube|threads|pinterest)"
                  r"\s+(?:post|caption|copy|video|script|reel|ad)\s+(?:announcing|about|introducing|for|on|that)?\s*",
                  "", text, flags=re.I)
    # "<modifier> <content-type> on <subject>" -> the subject is what follows
    text = re.sub(r"^\w+\s+(?:brief|copy|post|article|blog|newsletter|caption|script|summary|intro|outline)"
                  r"\s+(?:on|about|for|covering|regarding)\s+", "", text, flags=re.I)
    for _ in range(3):
        text = re.sub(r"^(?:an?\s+|the\s+|some\s+)?" + CONTENT_TYPES +
                      r"\s*(?:about|on|for|covering|regarding|introducing|explaining|announcing|to)?\s*",
                      "", text, flags=re.I)
    m = re.match(r"^(?:why|how)\s+(.{4,}?)\s+(?:matters?|works|helps?|ships?|is|are|will|should|can)\b.*$", text, flags=re.I)
    if m:
        text = m.group(1)
    m = re.match(r"^(?:about|on|regarding|covering|for)\s+(.{4,})$", text, flags=re.I)
    if m:
        text = m.group(1)
    # pick the richest connector segment: head vs tail of ' on | about | for '
    for connector in (" about ", " regarding ", " covering ", " on ", " to ", " for "):
        if connector in " " + text.lower() + " ":
            head, tail = re.split(re.escape(connector.strip()), text, maxsplit=1, flags=re.I)
            head, tail = head.strip(), tail.strip()
            def signal(part: str) -> int:
                return sum(1 for w in tokenize(part) if w not in NOISE_TOKENS)
            if len(tail) >= 4 and signal(tail) > signal(head):
                text = tail
            else:
                text = head
            break
    text = text.strip(" .,:;-!?")
    # an audience qualifier is context, not the subject
    text = re.sub(r"\s+(?:for|targeting|aimed\s+at|geared\s+toward)\s+(?:lean|small|busy|solo|early|new|"
                  r"marketing|agency|agencies|startup|startups|team|teams|founder|founders|brand|publisher|"
                  r"publishers|design|clients|readers|smb|enterprise|b2b|saas)\b.*$", "", text, flags=re.I)
    text = re.sub(r"\s+(?:that|which|so|because|where|and\s+how)\s.*$", "", text, flags=re.I)
    text = re.sub(r"[:,].*$", "", text)
    text = _drop_noise_edges(text)
    words = text.split()
    if len(words) > 5:
        text = " ".join(words[:4])
        text = _drop_noise_edges(text)
    for _ in range(4):
        text = re.sub(r"\s+(?:a|an|the|for|and|of|to|on|our|your|this|that|with)$", "", text.strip(), flags=re.I)
    text = fix_acronyms(text.strip(" .,:;-!?"))
    if len(text) > 58:
        text = text[:58].rsplit(" ", 1)[0]
    return text or fallback


def title_case(text: str) -> str:
    small = {"a", "an", "and", "the", "or", "of", "to", "in", "for", "on", "with", "vs", "at", "by", "as"}
    out = []
    for i, w in enumerate((text or "").split()):
        lw = w.lower()
        out.append(lw if (i and lw in small) else (w[:1].upper() + w[1:]))
    return fix_acronyms(" ".join(out))


def strip_md(text: str) -> str:
    """Flatten markdown so summarisers/analisers never score table pipes as prose."""
    out = re.sub(r"^#{1,6}\s*", "", text or "", flags=re.M)
    out = re.sub(r"^\s*(?:[-*+]|\d+\.)\s+", "", out, flags=re.M)
    out = re.sub(r"^\|.*\|$", "", out, flags=re.M)
    out = re.sub(r"^\s*>+\s?", "", out, flags=re.M)
    out = out.replace("**", "").replace("__", "").replace("`", "")
    out = re.sub(r"_([^_\n]{1,160})_", r"\1", out)
    out = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", out)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


# ------------------------------------------------------- deterministic noise
def dice(*parts: object) -> float:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:12], 16) / 0xFFFFFFFFFFFF


def pick(options: list, *salt: object):
    if not options:
        return ""
    return options[min(len(options) - 1, int(dice(*salt) * len(options)))]


def band(seed: object, low: int, high: int) -> int:
    return low + int(dice(seed) * (high - low + 1))


def log_scale(seed: object, low: int, high: int) -> int:
    """Search volumes should look power-law, not uniform."""
    r = dice(seed)
    lo = max(low, 1)
    return int(round(math.exp(math.log(lo) + r * (math.log(high) - math.log(lo)))))
