import { Fragment, useMemo } from "react";

// Small, dependency-free Markdown renderer for the generator's output.
// Handles: headings, bold/italic/code, links, images, bullets, numbered lists,
// tables, blockquotes, rules and typewriter streaming.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text, keyBase) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${i++}`;
    if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith("_")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith("!")) {
      const alt = tok.slice(2, tok.indexOf("]"));
      const src = tok.slice(tok.indexOf("(") + 1, -1);
      out.push(<img key={key} className="md-img" src={src} alt={alt} loading="lazy" />);
    } else {
      const label = tok.slice(1, tok.indexOf("]"));
      const href = tok.slice(tok.indexOf("(") + 1, -1);
      out.push(<a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderBlocks(md) {
  const lines = (md || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      const lvl = m[1].length;
      const Tag = `h${lvl}`;
      blocks.push(<Tag key={`h${i}`}>{inline(m[2], `h${i}`)}</Tag>);
      i += 1; continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push(<hr key={`r${i}`} />); i += 1; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      blocks.push(<blockquote key={`q${i}`}>{inline(buf.join(" "), `q${i}`)}</blockquote>);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i += 1;
      }
      blocks.push(
        <div className="scroll-x" key={`t${i}`}>
          <table>
            <thead><tr>{head.map((h, k) => <th key={k}>{inline(h, `th${k}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${ri}${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i += 1; }
      blocks.push(<ul key={`u${i}`}>{items.map((t, k) => <li key={k}>{inline(t, `u${i}-${k}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i += 1; }
      blocks.push(<ol key={`o${i}`}>{items.map((t, k) => <li key={k}>{inline(t, `o${i}-${k}`)}</li>)}</ol>);
      continue;
    }
    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\|)/.test(lines[i])) {
      para.push(lines[i]); i += 1;
    }
    blocks.push(<p key={`p${i}`}>{inline(para.join(" "), `p${i}`)}</p>);
  }
  return blocks;
}

export default function Markdown({ children, className = "" }) {
  const blocks = useMemo(() => renderBlocks(typeof children === "string" ? children : ""), [children]);
  return <div className={`md ${className}`}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

export function PlainText({ text, typed = 0 }) {
  const shown = typed > 0 ? text.slice(0, typed) : text;
  return <span>{esc(shown)}</span>;
}
