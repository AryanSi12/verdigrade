import { Fragment } from "react";

/**
 * Minimal Markdown renderer for the server's report (headings, lists, code fences, `code`, **bold**).
 * Builds React elements only, never innerHTML, so report text cannot inject markup.
 */
export default function MarkdownView({ text }) {
  const blocks = [];
  const lines = (text || "").split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) body.push(lines[index++]);
      index += 1;
      blocks.push(<pre key={blocks.length}>{body.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = `h${heading[1].length}`;
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const match = /^(\s*)[-*]\s+(.*)$/.exec(lines[index]);
        items.push({ depth: Math.floor(match[1].length / 2), text: match[2] });
        index += 1;
      }
      blocks.push(<List key={blocks.length} items={items} />);
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|```|\s*[-*]\s)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="markdown text-sm">{blocks}</div>;
}

function List({ items }) {
  // Turn a flat list with depths into nested <ul>s.
  const root = [];
  const stack = [{ depth: -1, children: root }];
  for (const item of items) {
    const node = { text: item.text, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ depth: item.depth, children: node.children });
  }
  const render = (nodes) => (
    <ul>
      {nodes.map((node, index) => (
        <li key={index}>
          {inline(node.text)}
          {node.children.length ? render(node.children) : null}
        </li>
      ))}
    </ul>
  );
  return render(root);
}

function inline(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return <strong key={index} className="text-ink">{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
