// Tiny CLI parser: --key value | --flag
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[name] = true;
    else { out[name] = next; i++; }
  }
  return out;
}

/** "1,2.5,4" or "0:6:0.5" (from:to:step, inclusive) → numbers */
export function nums(s) {
  return String(s).split(',').flatMap((part) => {
    if (part.includes(':')) {
      const [a, b, st] = part.split(':').map(Number);
      const r = [];
      for (let x = a; x <= b + 1e-9; x += st || 1) r.push(+x.toFixed(6));
      return r;
    }
    return [Number(part)];
  });
}
