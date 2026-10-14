import React from "react";

/**
 * Secure Markdown subset for GEOAGENTE messages.
 *
 * It deliberately never uses dangerouslySetInnerHTML. Text is escaped by
 * React; only http(s) links are allowed. No new package or lockfile changes.
 */
function inline(text: string): React.ReactNode[] {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  const content: React.ReactNode[] = [];
  let offset = 0;
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(text)) !== null) {
    if (found.index > offset) content.push(text.slice(offset, found.index));
    const key = String(found.index);
    if (found[2]) content.push(<strong key={key} className="font-bold text-slate-950 dark:text-white">{found[2]}</strong>);
    else if (found[3]) content.push(<code key={key} className="rounded bg-slate-100 px-1 dark:bg-slate-700">{found[3]}</code>);
    else if (found[4]) content.push(<em key={key}>{found[4]}</em>);
    else if (found[5] && found[6]) {
      content.push(<a key={key} href={found[6]} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline dark:text-sky-300">{found[5]}</a>);
    }
    offset = found.index + found[0].length;
  }
  if (offset < text.length) content.push(text.slice(offset));
  return content;
}

export function GeoAgentMarkdown({ text }: { text: string }) {
  const rows = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < rows.length) {
    const line = rows[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    const title = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (title) {
      const Tag = title[1].length <= 2 ? "h3" : "h4";
      nodes.push(<Tag key={i} className="mt-3 mb-1 text-sm font-bold text-slate-900 dark:text-white">{inline(title[2])}</Tag>);
      i++; continue;
    }
    if (/^```/.test(trimmed)) {
      const start = i++;
      const code: string[] = [];
      while (i < rows.length && !/^```/.test(rows[i].trim())) code.push(rows[i++]);
      if (i < rows.length) i++;
      nodes.push(<pre key={start} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const start = i;
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: React.ReactNode[] = [];
      while (i < rows.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(rows[i])) {
        items.push(<li key={i}>{inline(rows[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""))}</li>);
        i++;
      }
      nodes.push(ordered
        ? <ol key={start} className="my-2 list-decimal space-y-1 pl-5">{items}</ol>
        : <ul key={start} className="my-2 list-disc space-y-1 pl-5">{items}</ul>);
      continue;
    }
    if (trimmed.startsWith("|") && i + 1 < rows.length &&
        /^\s*\|?[\s:|-]+\|?[\s:|-]*$/.test(rows[i + 1])) {
      const start = i;
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map(x => x.trim());
      const headers = cells(rows[i]); i += 2;
      const body: React.ReactNode[] = [];
      while (i < rows.length && rows[i].trim().startsWith("|")) {
        body.push(<tr key={i}>{cells(rows[i]).map((cell, j) => <td key={j} className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">{inline(cell)}</td>)}</tr>);
        i++;
      }
      nodes.push(<div key={start} className="my-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{headers.map((header, j) => <th key={j} className="border-b border-slate-300 px-2 py-1.5 font-bold dark:border-slate-600">{inline(header)}</th>)}</tr></thead><tbody>{body}</tbody></table></div>);
      continue;
    }
    const start = i;
    const lines: string[] = [];
    while (i < rows.length && rows[i].trim() &&
           !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.)]\s)/.test(rows[i])) {
      lines.push(rows[i].trim()); i++;
    }
    if (i === start) { lines.push(rows[i].trim()); i++; }
    nodes.push(<p key={start} className="my-1.5 leading-relaxed">{lines.map((part, j) => <React.Fragment key={j}>{j > 0 && " "}{inline(part)}</React.Fragment>)}</p>);
  }
  return <div className="break-words text-xs text-slate-800 dark:text-slate-200">{nodes}</div>;
}
