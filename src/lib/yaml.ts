type YamlMap = Record<string, unknown>;
type YamlList = unknown[];
type StackFrame = { indent: number; value: YamlMap | YamlList; type: 'map' | 'list' };

function stripInlineComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '#' && !inSingle && !inDouble) {
      const prev = raw[i - 1];
      if (i === 0 || /\s/.test(prev)) {
        return raw.slice(0, i).trimEnd();
      }
    }
  }
  return raw;
}

function parseScalar(raw: string): unknown {
  raw = stripInlineComment(raw.trim());
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

function parseKeyValue(text: string): YamlMap {
  const colonIdx = text.indexOf(':');
  const key = text.slice(0, colonIdx).trim();
  const rest = text.slice(colonIdx + 1).trim();
  const obj: YamlMap = {};
  obj[key] = rest === '' ? {} : parseScalar(rest);
  return obj;
}

export function parseYaml(text: string): YamlMap {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const root: YamlMap = {};
  const stack: StackFrame[] = [{ indent: -1, value: root, type: 'map' }];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    i += 1;
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const trimmed = raw.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const ctx = stack[stack.length - 1];

    if (trimmed.startsWith('- ')) {
      const itemText = stripInlineComment(trimmed.slice(2).trim());
      if (ctx.type !== 'list') {
        throw new Error(`Unexpected list item at line: ${raw}`);
      }
      if (itemText === '') {
        const obj: YamlMap = {};
        (ctx.value as YamlList).push(obj);
        stack.push({ indent, value: obj, type: 'map' });
      } else if (itemText.includes(':')) {
        const obj = parseKeyValue(itemText);
        (ctx.value as YamlList).push(obj);
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
          stack.push({ indent, value: obj, type: 'map' });
        }
      } else {
        (ctx.value as YamlList).push(parseScalar(itemText));
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = stripInlineComment(trimmed.slice(colonIdx + 1).trim());
    const map = ctx.value as YamlMap;

    if (rest === '') {
      const peek = lines[i];
      const nextIsList = peek && /^\s*-\s/.test(peek);
      const child: YamlMap | YamlList = nextIsList ? [] : {};
      map[key] = child;
      stack.push({ indent, value: child, type: nextIsList ? 'list' : 'map' });
    } else if (rest === '[]') {
      map[key] = [];
      stack.push({ indent, value: map[key] as YamlList, type: 'list' });
    } else {
      map[key] = parseScalar(rest);
    }
  }

  return root;
}

export type VisaProfile = ReturnType<typeof parseYaml>;
