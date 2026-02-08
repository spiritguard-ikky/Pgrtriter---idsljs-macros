#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from "url";
const __filename = fileURLToPath(import.meta.url);

function isMain() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}
// console.log(output)



const buildCallRegex = (name, signature) =>
  new RegExp(
    `^[\\s\\t]*${name}\\s+${signatureToRegex(signature)}`,
    "gm"
  );


function signatureToRegex(sig) {
  const STRING =
    `"(?:\\\\.|[^"])*"|` +
    `'(?:(?:\\\\.)|[^'])*'|` +
    `\`(?:\\\\.|[^\`])*\``;

  const ATOM = `[^\\s]+`;
  const ARG = `${STRING}|${ATOM}`;

  const hasVariadic = /\$[a-zA-Z_]\w*\.{3}/.test(sig);

  let out = sig
    // remove ($delim...)
    .replace(/\(\s*\$[a-zA-Z_]\w*\.{3}\s*\)/g, "")
    // $param → string inteira OU átomo
    .replace(/\$[a-zA-Z_]\w*/g, `(${ARG})`)
    // ponto literal
    .replace(/\./g, "\\.");

  // sufixos só se a assinatura declarar variádico
  if (hasVariadic) {
    out += "((\\([^)]*\\)|\\[[^\\]]+\\])*)";
  }

  return out;
}


function extractParams(signature) {
  if (!signature) return [];

  // $a, $b, $msg, $delim...
  const params = [];
  const re = /\$([a-zA-Z_]\w*)(?:\.{3})?/g;

  let m;
  while ((m = re.exec(signature)) !== null) {
    if (!params.includes(m[1])) {
      params.push(m[1]);
    }
  }

  return params;
}


// ====== Tokenizer (com strings e preservando \n) ======
function tokenize(src) {
  const out = [];
  let i = 0;

  const isWS = (c) => c === " " || c === "\t" || c === "\r";
  const isIdentStart = (c) => /[A-Za-z_$]/.test(c);
  const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < src.length) {
    const c = src[i];

    // newline as token (helps repetition scanning)
    if (c === "\n") {
      out.push({ t: "\n", k: "nl" });
      i++;
      continue;
    }

    // whitespace (skip, but keep nl)
    if (isWS(c)) {
      i++;
      continue;
    }

    // strings: ", ', `
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      let s = quote;
      while (j < src.length) {
        const ch = src[j];
        s += ch;
        if (ch === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
          continue;
        }
        if (ch === quote) {
          j++;
          break;
        }
        j++;
      }
      out.push({ t: s, k: "str" });
      i = j;
      continue;
    }

    // placeholder $name (NOT $() - that's handled in pattern parsing)
    if (c === "$" && isIdentStart(src[i + 1] || "")) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j])) j++;
      out.push({ t: src.slice(i, j), k: "ph" }); // "$name"
      i = j;
      continue;
    }

    // identifier
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j])) j++;
      out.push({ t: src.slice(i, j), k: "id" });
      i = j;
      continue;
    }

    // punctuation/operators (single char token)
    out.push({ t: c, k: "p" });
    i++;
  }

  return out;
}

function skipNoise(tokens, i) {
  while (i < tokens.length && (tokens[i].k === "nl")) i++;
  return i;
}

// ====== Pattern parser: supports $name, literals, and $ ( ... ) ... repetition ======
function parsePattern(patternSrc) {
  const tok = tokenize(patternSrc);
  const nodes = [];
  let i = 0;

  while (i < tok.length) {
    i = skipNoise(tok, i);
    if (i >= tok.length) break;

    // repetition group: $( ... )...
    if (tok[i].t === "$" && tok[i + 1]?.t === "(") {
      // not used (tokenizer doesn't emit "$" alone), so handle by raw scan fallback
      // (kept for completeness)
    }

    // We detect repetition by scanning raw pattern string instead (robust):
    // But we can also detect it using tokens by spotting: "$(" in raw.
    // We'll do raw scanning below and merge with token stream parsing.
    break;
  }

  // Raw scan approach for repetition (simpler & reliable):
  // We re-parse patternSrc and emit nodes.
  return parsePatternRaw(patternSrc);
}

function parsePatternRaw(src) {
  const nodes = [];
  let i = 0;

  const flushLiteral = (s) => {
    const t = tokenize(s);
    for (const tk of t) {
      if (tk.k === "nl") continue;              // <-- IMPORTANTÍSSIMO
      if (tk.k === "ph") nodes.push({ kind: "ph", name: tk.t.slice(1) });
      else nodes.push({ kind: "lit", t: tk.t });
    }
  };


  while (i < src.length) {

    // encontrar próximo construto especial
    const nextRep  = src.indexOf("$(", i);
    const nextRest = src.indexOf("[$", i);

    let next = -1;
    if (nextRep !== -1 && nextRest !== -1) next = Math.min(nextRep, nextRest);
    else next = Math.max(nextRep, nextRest);

    // nada especial à frente → tudo é literal
    if (next === -1) {
      flushLiteral(src.slice(i));
      break;
    }

    // literal até o próximo construto
    if (next > i) {
      flushLiteral(src.slice(i, next));
      i = next;
    }

    // 1️⃣ REST: [$var...]
    const restMatch = src.slice(i).match(/^\[\s*\$([a-zA-Z_]\w*)\.{3}\s*\]/);
    if (restMatch) {
      nodes.push({ kind: "rest", name: restMatch[1] });
      i += restMatch[0].length;
      continue;
    }

    // 2️⃣ REPETIÇÃO: $( ... )...
    if (src.startsWith("$(", i)) {
      let j = i + 2;
      let depth = 1;
      let inner = "";

      while (j < src.length) {
        const ch = src[j];

        if (ch === '"' || ch === "'" || ch === "`") {
          const q = ch;
          inner += ch;
          j++;
          while (j < src.length) {
            const c2 = src[j];
            inner += c2;
            if (c2 === "\\" && j + 1 < src.length) {
              inner += src[j + 1];
              j += 2;
              continue;
            }
            if (c2 === q) {
              j++;
              break;
            }
            j++;
          }
          continue;
        }

        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (depth === 0) {
          j++;
          break;
        }

        inner += ch;
        j++;
      }

      if (src.slice(j, j + 3) !== "...") {
        throw new Error(`Expected "..." after $() group`);
      }

      const innerNodes = parsePatternRaw(inner.trim());
      const vars = collectVars(innerNodes);
      nodes.push({ kind: "rep", nodes: innerNodes, vars });

      i = j + 3;
      continue;
    }
  }


  // normalize: drop empty literals
  return nodes.filter((n) => !(n.kind === "lit" && n.t === ""));
}

function collectVars(nodes) {
  const s = new Set();
  for (const n of nodes) {
    if (n.kind === "ph") s.add(n.name);
    if (n.kind === "rep") for (const v of n.vars) s.add(v);
  }
  return [...s];
}



const TEMPLATE_IDENT_RE = /\$\`([\s\S]*?)\`/g;

function expandTemplateIdentifiers(src, matchCtx) {
  return src.replace(TEMPLATE_IDENT_RE, (_, inner) => {
    // resolve ${...} dentro do template
    let expanded = inner.replace(/\$\{([\s\S]*?)\}/g, (_, expr) => {
      return expr.replace(/\$([a-zA-Z_]\w*)\b/g, (_, v) => {
        if (v in matchCtx.scalars) return matchCtx.scalars[v];
        return `$${v}`;
      });
    });

    // identificador não pode ter espaços
    return expanded.replace(/\s+/g, "");
  });
}



// ====== Matcher (unification) ======
function matchNodes(nodes, tokens, i0) {
  let i = i0;
  const scalars = {};
  const repeats = []; // { vars:Set, items:[{...}] }

  const matchOne = (node) => {
    i = skipNoise(tokens, i);
    if (node.kind === "lit") {
      if (i >= tokens.length) return false;
      if (tokens[i].t !== node.t) return false;
      i++;
      return true;
    }
    if (node.kind === "rest") {
      const parts = [];
      // consome tudo até newline
      while (i < tokens.length && tokens[i].k !== "nl") {
        parts.push(tokens[i].t);
        i++;
      }
      scalars[node.name] = parts.join("");
      return true;
    }

    if (node.kind === "ph") {
      if (i >= tokens.length) return false;
      // placeholder captures one token (atomic). Operators remain literal in pattern.
      scalars[node.name] = tokens[i].t;
      i++;
      return true;
    }
    if (node.kind === "rep") {
      const items = [];

      while (true) {
        const saveI = i;
        const local = {};

        let ok = true;
        for (const inner of node.nodes) {
          i = skipNoise(tokens, i);

          if (inner.kind === "ph") {
            if (i >= tokens.length) { ok = false; break; }
            local[inner.name] = tokens[i].t;
            i++;
          } else if (inner.kind === "lit") {
            if (i >= tokens.length || tokens[i].t !== inner.t) { ok = false; break; }
            i++;
          }
        }

        if (!ok) {
          i = saveI;
          break;
        }

        items.push(local);

        i = skipNoise(tokens, i);
        while (i < tokens.length && (tokens[i].t === "," || tokens[i].t === ";")) i++;
      }

      // 🔴 PROMOÇÃO CORRETA (AQUI ESTAVA O BUG)
      if (items.length > 0) {
        for (const v of node.vars) {
          if (!(v in scalars)) {
            scalars[v] = items[0][v];
          }
        }
      }

      repeats.push({ vars: new Set(node.vars), items });
      return true;
    }

    return false;
  };

  for (const n of nodes) {
    if (!matchOne(n)) return { ok: false };
  }

  return { ok: true, next: i, scalars, repeats };
}

function expandBody(bodySrc, matchCtx) {
  let out = bodySrc;

  // 1️⃣ expandir repetições
  out = expandBodyReps(out, matchCtx);

  // 2️⃣ expandir identificadores templated $`{...}`
  out = expandTemplateIdentifiers(out, matchCtx);

  // 3️⃣ expandir substituições simples $var
  out = out.replace(/\$([a-zA-Z_]\w*)\b/g, (_, name) => {
    if (name in matchCtx.scalars) return matchCtx.scalars[name];
    return `$${name}`;
  });

  return out;
}


function expandBodyReps(src, matchCtx) {
  // Expand all occurrences of $( ... )...
  let out = "";
  let i = 0;

  while (i < src.length) {
    const idx = src.indexOf("$(", i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }

    out += src.slice(i, idx);

    // find matching ')'
    let j = idx + 2;
    let depth = 1;
    let inner = "";

    while (j < src.length) {
      const ch = src[j];

      // strings inside body template
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        inner += ch;
        j++;
        while (j < src.length) {
          const c2 = src[j];
          inner += c2;
          if (c2 === "\\" && j + 1 < src.length) {
            inner += src[j + 1];
            j += 2;
            continue;
          }
          if (c2 === q) {
            j++;
            break;
          }
          j++;
        }
        continue;
      }

      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth === 0) {
        j++;
        break;
      }
      inner += ch;
      j++;
    }

    if (src.slice(j, j + 3) !== "...") {
      throw new Error(`Expected "..." after $() group in body near: ${src.slice(idx, idx + 20)}`);
    }
    j += 3;

    const innerVars = new Set();
    inner.replace(/\$([a-zA-Z_]\w*)\b/g, (_, v) => innerVars.add(v));

    // choose the first repeat capture that covers these vars
    const rep = matchCtx.repeats.find(r => {
      for (const v of innerVars) if (!r.vars.has(v)) return false;
      return true;
    });

    const items = rep ? rep.items : [];
    let chunk = "";

    for (const item of items) {
      // item variables override scalars for the duration
      const localCtx = {
        scalars: { ...matchCtx.scalars, ...item },
        repeats: matchCtx.repeats
      };
      chunk += expandBody(inner, localCtx);
    }

    out += chunk;
    i = j;
  }

  return out;
}

// ====== Macro parsing and application ======
export function parseMacrosFromBlock(block) {
  if (!block) return [];

  const macroRe =
    /^\s*\$macro\s+([\s\S]*?)\s*#\(\s*([\s\S]*?)\s*\)#/gm;

  const macros = [];
  let mm;

  while ((mm = macroRe.exec(block)) !== null) {
    const patternSrc = mm[1].trim();
    const bodySrc = mm[2];

    const pattern = parsePattern(patternSrc);

    const head = pattern.find(n => n.kind === "lit")?.t;
    if (!head) {
      throw new Error(`Macro pattern has no literal head token: ${patternSrc}`);
    }

    macros.push({ head, patternSrc, pattern, bodySrc });
  }

  return macros;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findInvocationSlice(code, startIdx, patternSrc) {
  // If pattern includes '{', capture a balanced {...} block from the first '{' after start
  const bracePos = code.indexOf("{", startIdx);
  const wantsBlock = patternSrc.includes("{") && patternSrc.includes("}");
  if (!wantsBlock) {
    // single line
    const end = code.indexOf("\n", startIdx);
    return { endIdx: end === -1 ? code.length : end + 1 };
  }

  if (bracePos === -1) {
    const end = code.indexOf("\n", startIdx);
    return { endIdx: end === -1 ? code.length : end + 1 };
  }

  // scan for matching '}'
  let i = bracePos;
  let depth = 0;
  while (i < code.length) {
    const ch = code[i];

    // skip strings so braces inside strings don't count
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < code.length) {
        const c2 = code[i];
        if (c2 === "\\" && i + 1 < code.length) { i += 2; continue; }
        if (c2 === q) { i++; break; }
        i++;
      }
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        // include trailing newline if present
        const end = (i + 1 < code.length && code[i + 1] === "\n") ? i + 2 : i + 1;
        return { endIdx: end };
      }
    }
    i++;
  }

  return { endIdx: code.length };
}

function indentBlock(text, indent) {
  return text
    .split("\n")
    .map(line => indent + line)
    .join("\n");
}

function applyMacrosOnce(code, macros) {
  // Find candidates by head token at line start (preserve indent)
  // Collect replacements from end to start.
  const reps = [];

  for (const mac of macros) {
    const headRe = new RegExp(`^([ \\t]*)${escapeRegex(mac.head)}\\b`, "gm");
    let m;
    while ((m = headRe.exec(code)) !== null) {
      const indent = m[1];
      const startIdx = m.index;
      const { endIdx } = findInvocationSlice(code, startIdx, mac.patternSrc);
      const slice = code.slice(startIdx, endIdx);

      const sliceTokens = tokenize(slice);
      const res = matchNodes(mac.pattern, sliceTokens, 0);
      if (!res.ok) continue;

      const expanded = expandBody(mac.bodySrc, res).trimEnd();
      const withIndent = indentBlock(expanded, indent) + (slice.endsWith("\n") ? "\n" : "");

      reps.push({ startIdx, endIdx, replacement: withIndent });
    }
  }

  if (reps.length === 0) return code;

  reps.sort((a, b) => b.startIdx - a.startIdx);
  let out = code;
  for (const r of reps) {
    out = out.slice(0, r.startIdx) + r.replacement + out.slice(r.endIdx);
  }
  return out;
}

export function expandMacros(code, macros, maxPasses = 20) {
  let current = code;
  for (let p = 0; p < maxPasses; p++) {
    const next = applyMacrosOnce(current, macros);
    if (next === current) return next;
    current = next;
  }
  throw new Error("Macro expansion exceeded max passes (possible infinite recursion)");
}

export function stripMacrosBlock(source) {
  const idx = source.indexOf("macros:");
  if (idx === -1) return { macrosBlock: "", output: source };

  const braceStart = source.indexOf("{", idx);
  if (braceStart === -1) {
    throw new Error("macros: found but no opening {");
  }

  let i = braceStart;
  let depth = 0;

  while (i < source.length) {
    const ch = source[i];

    // ignorar strings
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < source.length) {
        const c2 = source[i];
        if (c2 === "\\" && i + 1 < source.length) {
          i += 2;
          continue;
        }
        if (c2 === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const end = i + 1;
        const macrosBlock = source.slice(braceStart + 1, i);
        const output =
          source.slice(0, idx) + source.slice(end);
        return { macrosBlock, output };
      }
    }
    i++;
  }

  throw new Error("Unclosed macros:{ block");
}

if (isMain()) {
  const input = process.argv[2];
  const outputFile = process.argv[3] || "";

  if (!input || !fs.existsSync(input)) {
    console.error("Uso: node compile.js <arquivo.dsljs.js>");
    process.exit(1);
  }

  const source = fs.readFileSync(input, "utf8");

  const { macrosBlock, output } = stripMacrosBlock(source);
  // ====== Example usage (wire into your existing CLI) ======
  const finalOutput = expandMacros(output, parseMacrosFromBlock(macrosBlock));

  if (outputFile) {
    const dir = path.dirname(outputFile);

    if (dir && dir !== ".") {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputFile, finalOutput, "utf8");
  } else {
    console.log(finalOutput);
  }
}