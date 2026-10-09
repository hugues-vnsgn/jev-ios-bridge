const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
const doctype = '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';
const xmlCharacter = (code) => code === 9 || code === 10 || code === 13
    || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
function invalid() { throw new Error('Unconfirmed readonly mount metadata'); }
/** Parse bounded diskutil plist text only; this performs no mount or namespace authorization. */
export function parseReadonlyMountMetadata(xml, expectedMountPoint) {
    if (typeof xml !== 'string' || Buffer.byteLength(xml) > 65536 || typeof expectedMountPoint !== 'string'
        || !expectedMountPoint.startsWith('/') || expectedMountPoint.includes('\0'))
        invalid();
    for (const character of xml)
        if (!xmlCharacter(character.codePointAt(0)))
            invalid();
    let cursor = 0;
    let nodes = 1; // The plist wrapper is the first node and depth 1.
    const whitespace = () => { while (cursor < xml.length && /[\t\r\n ]/.test(xml[cursor]))
        cursor++; };
    const take = (literal) => { if (!xml.startsWith(literal, cursor))
        invalid(); cursor += literal.length; };
    const tagPattern = /<(\/?)([a-z]+)[\t\r\n ]*(\/?)>/y;
    const tag = () => {
        tagPattern.lastIndex = cursor;
        const match = tagPattern.exec(xml);
        if (!match)
            return invalid();
        cursor = tagPattern.lastIndex;
        return { name: match[2], closing: match[1] === '/', empty: match[3] === '/' };
    };
    const open = (depth) => {
        whitespace();
        if (depth > 32 || ++nodes > 8192)
            invalid();
        const result = tag();
        if (result.closing)
            invalid();
        return result;
    };
    const close = (name) => {
        whitespace();
        const result = tag();
        if (!result.closing || result.empty || result.name !== name)
            invalid();
    };
    const closing = (name) => { whitespace(); return xml.startsWith(`</${name}`, cursor); };
    const decode = (raw) => {
        if (raw.includes(']]>'))
            invalid();
        const text = raw.replace(/\r\n?/g, '\n');
        let decoded = '';
        let start = 0;
        const builtins = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
        for (;;) {
            const amp = text.indexOf('&', start);
            if (amp < 0)
                return decoded + text.slice(start);
            const end = text.indexOf(';', amp + 1);
            if (end < 0)
                return invalid();
            decoded += text.slice(start, amp);
            const entity = text.slice(amp + 1, end);
            if (Object.hasOwn(builtins, entity))
                decoded += builtins[entity];
            else {
                if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity))
                    invalid();
                const code = entity[1] === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
                if (!Number.isSafeInteger(code) || !xmlCharacter(code))
                    invalid();
                decoded += String.fromCodePoint(code);
            }
            start = end + 1;
        }
    };
    const scalar = (name, empty) => {
        if (empty)
            return '';
        const end = xml.indexOf('<', cursor);
        if (end < 0)
            return invalid();
        const text = decode(xml.slice(cursor, end));
        cursor = end;
        close(name);
        return text;
    };
    const value = (depth) => {
        const current = open(depth);
        if (current.name === 'dict') {
            const entries = new Map();
            if (current.empty)
                return entries;
            while (!closing('dict')) {
                const key = open(depth + 1);
                if (key.name !== 'key')
                    invalid();
                const name = scalar('key', key.empty);
                if (entries.has(name))
                    invalid();
                entries.set(name, value(depth + 1));
            }
            close('dict');
            return entries;
        }
        if (current.name === 'array') {
            const entries = [];
            if (current.empty)
                return entries;
            while (!closing('array'))
                entries.push(value(depth + 1));
            close('array');
            return entries;
        }
        if (current.name === 'string')
            return scalar('string', current.empty);
        if (current.name === 'true' || current.name === 'false') {
            if (!/^[\t\r\n ]*$/.test(scalar(current.name, current.empty)))
                invalid();
            return current.name === 'true';
        }
        if (!['integer', 'real', 'date', 'data'].includes(current.name))
            return invalid();
        const text = scalar(current.name, current.empty).replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, '');
        if (current.name === 'integer' && !/^-?(?:0|[1-9][0-9]*)$/.test(text))
            invalid();
        if (current.name === 'real' && (!/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text)
            || !Number.isFinite(Number(text))))
            invalid();
        if (current.name === 'date') {
            if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(text))
                invalid();
            const date = new Date(text);
            if (!Number.isFinite(date.getTime()) || date.toISOString().replace('.000Z', 'Z') !== text)
                invalid();
        }
        if (current.name === 'data') {
            const data = text.replace(/[\t\r\n ]/g, '');
            if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
                || Buffer.from(data, 'base64').toString('base64') !== data)
                invalid();
        }
        return { kind: current.name, text };
    };
    take(declaration);
    whitespace();
    take(doctype);
    whitespace();
    take('<plist version="1.0">');
    const root = value(2);
    close('plist');
    whitespace();
    if (cursor !== xml.length || !(root instanceof Map))
        invalid();
    const mount = root.get('MountPoint');
    if (typeof mount !== 'string' || mount !== expectedMountPoint || root.get('Writable') !== false
        || root.get('WritableMedia') !== false || root.get('WritableVolume') !== false)
        invalid();
    return { MountPoint: mount, Writable: false, WritableMedia: false, WritableVolume: false };
}
