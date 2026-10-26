export class ObservationIncompleteError extends Error {
  readonly truncated = true;
  readonly code = 'TRUNCATED';
  constructor(readonly reason: 'invalid-source' | 'source-limit' | 'node-limit' | 'depth-limit' | 'driver-error' | 'timeout', options?: { cause: unknown }) {
    super('The page source is incomplete.', options);
    this.name = 'ObservationIncompleteError';
  }
}

export interface SourceNode {
  name: string;
  attributes: Record<string, string>;
  children: SourceNode[];
}
function invalid(): never { throw new ObservationIncompleteError('invalid-source'); }
const xmlCharacter = (cp: number) => cp === 9 || cp === 10 || cp === 13 ||
  (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function attributeText(raw: string): string {
  if (raw.includes('<')) invalid();
  return raw.replace(/&([^;]*);|&/g, (match: string, entity: string | undefined) => {
    if (!entity) return invalid();
    if (Object.hasOwn(entities, entity)) return entities[entity]!;
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) return invalid();
    const cp = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return xmlCharacter(cp) ? String.fromCodePoint(cp) : invalid();
  });
}

export function parseSource(xml: string, depthLimit: number): SourceNode {
  if (Buffer.byteLength(xml, 'utf8') > 8 * 1024 * 1024) throw new ObservationIncompleteError('source-limit');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid();
  for (const c of xml) if (!xmlCharacter(c.codePointAt(0)!)) invalid();
  const stack: SourceNode[] = [];
  let root: SourceNode | undefined;
  let at = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  let count = 0;
  if (xml.slice(at).startsWith('<?xml ')) {
    const declaration = /^<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?(?:\s+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>/i.exec(xml.slice(at));
    if (!declaration) invalid();
    at += declaration[0].length;
  }
  while (at < xml.length) {
    const whitespace = /^\s+/.exec(xml.slice(at));
    if (whitespace) { at += whitespace[0].length; continue; }
    if (xml.startsWith('<!--', at)) {
      const end = xml.indexOf('-->', at + 4);
      if (end === -1 || xml.slice(at + 4, end).includes('--')) invalid();
      at = end + 3; continue;
    }
    const close = /^<\/([A-Za-z_][\w.:-]*)\s*>/.exec(xml.slice(at));
    if (close) {
      if (stack.pop()?.name !== close[1]) invalid();
      at += close[0].length; continue;
    }
    const open = /^<([A-Za-z_][\w.:-]*)/.exec(xml.slice(at));
    if (!open) invalid();
    if (++count > 20_000) throw new ObservationIncompleteError('node-limit');
    if (stack.length >= depthLimit) throw new ObservationIncompleteError('depth-limit');
    const node: SourceNode = { name: open[1]!, attributes: Object.create(null), children: [] };
    at += open[0].length;
    while (!xml.startsWith('>', at) && !xml.startsWith('/>', at)) {
      const attr = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(xml.slice(at));
      if (!attr) {
        const endSpace = /^\s+(?=\/?>)/.exec(xml.slice(at));
        if (!endSpace) invalid();
        at += endSpace[0].length; break;
      }
      const key = attr[1]!;
      if (Object.hasOwn(node.attributes, key)) invalid();
      node.attributes[key] = attributeText(attr[2] ?? attr[3] ?? '');
      at += attr[0].length;
    }
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else if (root) invalid();
    else root = node;
    if (xml.startsWith('/>', at)) at += 2;
    else if (xml.startsWith('>', at)) { at++; stack.push(node); }
    else invalid();
  }
  if (stack.length || !root) invalid();
  return root;
}
