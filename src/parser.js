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

const DEBUG_REP =
  process.env.DEBUG_REP === "1" ||
  process.env.DEBUG_REP === "true" ||
  false;


const isWSChar = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";
const isIdentChar = (c) => /[A-Za-z0-9_$]/.test(c || "");
const isIdentStartChar = (c) => /[A-Za-z_$]/.test(c || "");
const IDENT_START = "[A-Za-z_\\p{L}]";
const IDENT_CONT  = "[A-Za-z0-9_\\p{L}]";
const PH_RE = new RegExp(`\\$(${IDENT_START}${IDENT_CONT}*)\\b`, "gu");
const PH_INNER_RE = new RegExp(`\\$(${IDENT_START}${IDENT_CONT}*)`, "gu"); // sem \\b (pra template)


function skipWS(src, i) {
  while (i < src.length && isWSChar(src[i])) i++;
  return i;
}

function readString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\" && j + 1 < src.length) { j += 2; continue; }
    if (ch === q) { j++; break; }
    j++;
  }
  return { ok: true, text: src.slice(i, j), next: j };
}

function readBalanced(src, i, open, close) {
  let j = i;
  let depth = 0;

  while (j < src.length) {
    const ch = src[j];

    if (ch === '"' || ch === "'" || ch === "`") {
      const s = readString(src, j);
      j = s.next;
      continue;
    }

    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }

    j++;
  }

  if (depth !== 0) {
    return { ok: false };
  }

  return {
    ok: true,
    text: src.slice(i, j),
    next: j
  };
}


// átomo do DSL: string, bloco balanceado, ou token até separador
function readAtom(src, i) {
  i = skipWS(src, i);
  if (i >= src.length){

      console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };

  const ch = src[i];

  if (ch === '"' || ch === "'" || ch === "`") return readString(src, i);
  if (ch === "[") return readBalanced(src, i, "[", "]");
  if (ch === "{") return readBalanced(src, i, "{", "}");
  if (ch === "(") return readBalanced(src, i, "(", ")");

  // lê até whitespace ou separadores “fortes”
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (isWSChar(c)) break;
    if (
    c === "," || c === ":" || c === ";" ||
    c === "." ||          // ← importante (caso THREE $a.$b...)
    c === "(" ||          // ← importante (caso Scene(...), PerspectiveCamera(...)
    c === "[" ||          // ← importante (caso BoxGeometry[0])
    c === "]" || c === "}" || c === ")"
  ) break;

    j++;
  }
  if (j === i){
    console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };
  return { ok: true, text: src.slice(i, j), next: j };
}

function matchLiteralToken(src, i, lit) {
  i = skipWS(src, i);
  if (!src.startsWith(lit, i)){
      
      return { ok: false }
    };

  // boundary para literais que são identifiers (ex: "struct", "THREE")
  if (isIdentStartChar(lit[0])) {
    const prev = src[i - 1];
    const next = src[i + lit.length];
    if (isIdentChar(prev)){
      return { ok: false }
    };
    if (isIdentChar(next)){
      return { ok: false }
    };
  }

  return { ok: true, next: i + lit.length };
}

function escapeForOuterTemplate(str) {
  return str
    .replace(/\\/g, "\\\\")   // escape barras primeiro
    .replace(/`/g, "\\`");    // escape backticks
}

function matchNodesOnSource(nodes, src, i0, ctx) {

  if(DEBUG_REP){
    console.log("\n--- MATCH START ---");
    console.log("Nodes:", nodes.map(n => n.kind + (n.t ? ":" + n.t : "")));
    console.log("Source:", src.slice(i0, i0 + 120));
  }

  let i = i0;
  

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];

    if (DEBUG_REP && node.kind === "rep") {
      console.log("Rep nodes:", node.nodes);
    }

    if (node.kind === "lit") {
      const m = matchLiteralToken(src, i, node.t);
      if (!m.ok){
        console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };
      i = m.next;
      continue;
    }

    if (node.kind === "ph") {

      i = skipWS(src, i);

      // 🔹 capturar comentário + template literal juntos
      if (src.startsWith("/*", i)) {

        const cmtEnd = src.indexOf("*/", i + 2);
        if (cmtEnd !== -1) {

          let j = cmtEnd + 2;
          j = skipWS(src, j);

          if (src[j] === "`") {
            const tpl = readString(src, j);
            if (!tpl.ok) return { ok: false };

            const full = src.slice(i, tpl.next);
            ctx.scalars[node.name] = full.trim();
            i = tpl.next;
            continue;
          }
        }
      }

      // 🔹 delimitadores balanceados
      const ch = src[i];

      if (ch === "(" || ch === "{" || ch === "[") {

        const pairs = { "(": ")", "{": "}", "[": "]" };

        const b = readBalanced(src, i, ch, pairs[ch]);
        if (!b.ok) return { ok: false };

        ctx.scalars[node.name] = b.text.slice(1, -1).trim();
        i = b.next;
        continue;
      }

      // 🔹 fallback normal
      const a = readAtom(src, i);
      if (!a.ok) return { ok: false };

      ctx.scalars[node.name] = a.text;
      i = a.next;
      continue;
    }




    if (node.kind === "block") {
      i = skipWS(src, i);
      if (src[i] !== node.open){
        console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };
      const b = readBalanced(src, i, node.open, node.close);
      if (!b.ok){
        console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };

      // captura sem bordas
      ctx.scalars[node.name] = b.text.slice(1, -1).trim();
      i = b.next;
      continue;
    }

    if (node.kind === "rest") {
      // captura “o resto” até newline ou ; (whitespace-insensitive)
      let j = i;
      // não pula WS aqui; o “resto” pode começar com '(' etc.
      while (j < src.length) {
        const ch = src[j];
        if (ch === "\n") break;
        if (ch === ";") break;
        j++;
      }
      ctx.scalars[node.name] = src.slice(i, j).trim();
      i = j;
      continue;
    }

    if (node.kind === "group") {
      const local = {};
      const innerCtx = { scalars: local, repeats: [] };

      const r = matchNodesOnSource(node.nodes, src, i, innerCtx);
      if (!r.ok){
        console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };

      // promover variáveis capturadas
      for (const k in local) {
        ctx.scalars[k] = local[k];
      }

      i = r.next;
      continue;
    }


    if (node.kind === "rep") {
      const items = [];

      while (true) {
        const saveI = i;
        const local = {};
        const innerCtx = { scalars: local, repeats: [] };

        const r = matchNodesOnSource(node.nodes, src, i, innerCtx);
        if (!r.ok) { i = saveI; break; }

        items.push(local);
        i = r.next;

        // separadores opcionais entre itens
        i = skipWS(src, i);
        if (src[i] === "," || src[i] === ";") {
          i++;
        }
        // permite newline/indent etc
        i = skipWS(src, i);

        // parada natural antes de fechamentos comuns
        const peek = skipWS(src, i);
        const c = src[peek];
        if (c === "]" || c === "}" || c === ")" || c === undefined) {
          i = peek;
          break;
        }
      }

      if (DEBUG_REP) {
        console.log("=== REP CAPTURED ===");
        console.log("Vars:", Array.from(node.vars));
        console.log("Items:", items);
        console.log("====================");
      }
      ctx.repeats.push({ vars: new Set(node.vars), items });
      continue;
    }

   {
    console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };
  }

  return { ok: true, next: i };
}


// const buildCallRegex = (name, signature) =>
//   new RegExp(
//     `^[\\s\\t]*${name}\\s+${signatureToRegex(signature)}`,
//     "gm"
//   );


// function signatureToRegex(sig) {
//   const STRING =
//     `"(?:\\\\.|[^"])*"|` +
//     `'(?:(?:\\\\.)|[^'])*'|` +
//     `\`(?:\\\\.|[^\`])*\``;

//   const ATOM = `[^\\s]+`;
//   const ARG = `${STRING}|${ATOM}`;

//   const hasVariadic = /\$[a-zA-Z_]\w*\.{3}/.test(sig);

//   let out = sig
//     // remove ($delim...)
//     .replace(/\(\s*\$[a-zA-Z_]\w*\.{3}\s*\)/g, "")
//     // $param → string inteira OU átomo
//     .replace(/\$[a-zA-Z_]\w*/g, `(${ARG})`)
//     // ponto literal
//     .replace(/\./g, "\\.");

//   // sufixos só se a assinatura declarar variádico
//   if (hasVariadic) {
//     out += "((\\([^)]*\\)|\\[[^\\]]+\\])*)";
//   }

//   return out;
// }


// function extractParams(signature) {
//   if (!signature) return [];

//   // $a, $b, $msg, $delim...
//   const params = [];
//   const re = /\$([a-zA-Z_]\w*)(?:\.{3})?/g;

//   let m;
//   while ((m = re.exec(signature)) !== null) {
//     if (!params.includes(m[1])) {
//       params.push(m[1]);
//     }
//   }

//   return params;
// }

// function readString(src, i0) {
//   const quote = src[i0];
//   let i = i0 + 1;

//   while (i < src.length) {
//     const ch = src[i];

//     if (ch === "\\" && i + 1 < src.length) {
//       i += 2;
//       continue;
//     }

//     if (ch === quote) {
//       i++;
//       break;
//     }

//     i++;
//   }

//   return {
//     ok: true,
//     raw: src.slice(i0, i),
//     next: i
//   };
// }

function readTemplateLiteral(src, i) {
  if (src[i] !== "`") return { ok: false };

  let j = i + 1;
  let depthExpr = 0;

  while (j < src.length) {
    const ch = src[j];

    // escape
    if (ch === "\\" && j + 1 < src.length) {
      j += 2;
      continue;
    }

    // ${ interpolation
    if (ch === "$" && src[j + 1] === "{") {
      depthExpr++;
      j += 2;
      continue;
    }

    if (ch === "}" && depthExpr > 0) {
      depthExpr--;
      j++;
      continue;
    }

    // nested template literal
    if (ch === "`" && depthExpr === 0) {
      // ⚠️ verificar se é abertura de nested template
      // olhando para trás para ver se faz parte de /* css */`
      const prevSlice = src.slice(Math.max(0, j - 10), j);

      if (prevSlice.includes("/*")) {
        const nested = readTemplateLiteral(src, j);
        if (!nested.ok) return { ok: false };
        j = nested.next;
        continue;
      }

      // fechamento real
      return {
        ok: true,
        text: src.slice(i, j + 1),
        inner: src.slice(i + 1, j),
        next: j + 1
      };
    }

    j++;
  }

  return { ok: false };
}




// ====== Tokenizer (com strings e preservando \n) ======
function tokenize(src) {
  const out = [];
  let i = 0;

  const isWS = (c) => c === " " || c === "\t" || c === "\r";
  const isIdentStart = (c) => /[A-Za-z_$\p{L}]/u.test(c);
  const isIdent = (c) => /[A-Za-z0-9_$\p{L}]/u.test(c);


  while (i < src.length) {
    const start = i;
    const c = src[i];

    if (c === "\n") {
      out.push({ t: "\n", k: "nl", start, end: i + 1 });
      i++;
      continue;
    }

    if (isWS(c)) {
      i++;
      continue;
    }

    if (c === "`") {
      const tpl = readTemplateLiteral(src, i);
      out.push({
        t: tpl.raw,
        k: "template",
        start,
        end: tpl.next
      });
      i = tpl.next;
      continue;
    }

    if (c === '"' || c === "'") {
      const s = readString(src, i);
      out.push({ t: s.raw, k: "str", start, end: s.next });
      i = s.next;
      continue;
    }



    if (c === "$" && isIdentStart(src[i + 1] || "")) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j])) j++;
      out.push({ t: src.slice(start, j), k: "ph", start, end: j });
      i = j;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j])) j++;
      out.push({ t: src.slice(start, j), k: "id", start, end: j });
      i = j;
      continue;
    }

    out.push({ t: c, k: "p", start, end: i + 1 });
    i++;
  }

  return out;
}


function skipNoise(tokens, i) {
  while (
    i < tokens.length &&
    (
      tokens[i].k === "nl" ||
      tokens[i].k === "ws" ||
      tokens[i].t === "\n"
    )
  ) {
    i++;
  }
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

    for (let idx = 0; idx < t.length; idx++) {
      const tk = t[idx];

      if (tk.k === "nl") continue;

      if (tk.t === "=" && t[idx + 1] && t[idx + 1].t === ">") {
        nodes.push({ kind: "lit", t: "=" });
        nodes.push({ kind: "lit", t: ">" });
        idx++;
        continue;
      }

      if (tk.k === "ph") {
        nodes.push({ kind: "ph", name: tk.t.slice(1) });
      } else {
        nodes.push({ kind: "lit", t: tk.t });
      }
    }
  };

  while (i < src.length) {

    const nextRep  = src.indexOf("$(", i);
    const nextRest = src.indexOf("[$", i);

    let next = -1;
    if (nextRep !== -1 && nextRest !== -1) next = Math.min(nextRep, nextRest);
    else next = Math.max(nextRep, nextRest);

    if (next === -1) {
      flushLiteral(src.slice(i));
      break;
    }

    if (next > i) {
      flushLiteral(src.slice(i, next));
      i = next;
    }

    // REST: [$var...]
    const restMatch = src.slice(i).match(/^\[\s*\$([a-zA-Z_]\w*)\.{3}\s*\]/);
    if (restMatch) {
      nodes.push({ kind: "rest", name: restMatch[1] });
      i += restMatch[0].length;
      continue;
    }

    // BLOCK: [$var]
    const blockMatch = src.slice(i).match(/^\[\s*\$([a-zA-Z_]\w*)\s*\]/);
    if (blockMatch) {
      nodes.push({
        kind: "block",
        name: blockMatch[1],
        open: "[",
        close: "]"
      });
      i += blockMatch[0].length;
      continue;
    }

    // GROUP ou REP: $(...)
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

      const innerNodes = parsePatternRaw(inner.trim());
      const vars = collectVars(innerNodes);

      // 🔥 verificar se é repetição
      if (src.slice(j, j + 3) === "...") {
        nodes.push({ kind: "rep", nodes: innerNodes, vars });
        i = j + 3;
      } else {
        nodes.push({ kind: "group", nodes: innerNodes, vars });
        i = j;
      }

      continue;
    }
  }

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
      return expr.replace(PH_RE, (_, v) => {
        if (v in matchCtx.scalars) return matchCtx.scalars[v];
        return `$${v}`;
      });
    });

    expanded = expanded.replace(/\$([A-Za-z_\p{L}][A-Za-z0-9_\p{L}]*)/gu, (_, ident) => {
      // match exato primeiro
      if (ident in matchCtx.scalars) return matchCtx.scalars[ident];

      // tenta maior prefixo existente no ctx
      for (let cut = ident.length - 1; cut >= 1; cut--) {
        const head = ident.slice(0, cut);
        if (head in matchCtx.scalars) {
          const tail = ident.slice(cut);
          return String(matchCtx.scalars[head]) + tail;
        }
      }

      // não achou nada
      return `$${ident}`;
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
      const remaining = tokens
        .slice(i)
        .map(t => t.raw ?? t.t)
        .join("");

      scalars[node.name] = remaining;
      i = tokens.length;
      return true;
    }

    if (node.kind === "opt") {
        const saveI = i;
        const saveScalars = {...scalars};

        const r = matchNodes(node.nodes, tokens, i);
        if (r.ok) {
            i = r.next;
            Object.assign(scalars, r.scalars);
        } else {
            i = saveI;
        }
        return true;
    }


    if (node.kind === "group") {
      const local = {};
      const saveI = i;

      let ok = true;

      for (const inner of node.nodes) {
        i = skipNoise(tokens, i);

        if (inner.kind === "ph") {
          if (i >= tokens.length) { ok = false; break; }
          local[inner.name] = tokens[i].t;
          i++;
        } else if (inner.kind === "lit") {
          if (i >= tokens.length || tokens[i].t !== inner.t) {
            ok = false;
            break;
          }
          i++;
        } else {
          ok = false;
          break;
        }
      }

      if (!ok) {
        i = saveI;
        return false;
      }

      // promover variáveis para scalars
      for (const k in local) {
        scalars[k] = local[k];
      }

      return true;
    }

    if (node.kind === "ph") {
      console.log("TRY PH:", node.name, "AT", tokens[i]);
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
    if (!matchOne(n)){
      console.log("❌ FAIL at node:", node);
      console.log("Cursor at:", i);
      console.log("Remaining:", src.slice(i, i + 60));
      return { ok: false }
    };
  }

  return { ok: true, next: i, scalars, repeats };
}

function escapeUnescapedBackticks(text) {
  // escapa apenas ` que NÃO esteja precedido por \
  // (evita virar \\` e evita triplo-escape)
  return text.replace(/(?<!\\)`/g, "\\`");
}


function escapeTemplatesInsideAnnotatedJavascript(src) {
  let out = "";
  let i = 0;

  while (i < src.length) {

    if (src.startsWith("/*", i)) {

      const endCmt = src.indexOf("*/", i + 2);
      if (endCmt === -1) {
        out += src[i++];
        continue;
      }

      const comment = src.slice(i, endCmt + 2);
      const isJS = /\/\*\s*javascript\s*\*\//i.test(comment);

      out += comment;
      i = endCmt + 2;

      if (!isJS) continue;

      i = skipWS(src, i);

      if (src[i] !== "`") continue;

      const tpl = readTemplateLiteral(src, i);
      if (!tpl.ok) continue;

      const escapedContent = tpl.inner.replace(/(?<!\\)`/g, "\\`");

      out += "`" + escapedContent + "`";

      i = tpl.next;
      continue;
    }

    out += src[i++];
  }

  return out;
}





function expandBody(bodySrc, matchCtx) {
  let out = bodySrc;

  // 1️⃣ expandir repetições
  out = expandBodyReps(out, matchCtx);

  // 2️⃣ expandir identificadores templated $`{...}`
  out = expandTemplateIdentifiers(out, matchCtx);

  // detecta se o corpo está dentro de template literal
  out = out.replace(PH_RE, (_, name) => {
    if (name in matchCtx.scalars) return matchCtx.scalars[name];
    return `$${name}`;
  });


  return out;
}


function expandBodyReps(bodySrc, matchCtx) {
  return bodySrc.replace(
    /^([ \t]*)\$\(([\s\S]*?)\)\.\.\./gm,
    (_, indent, inner) => {

      // detectar variáveis do template
      const varsInTemplate = Array.from(
        inner.matchAll(PH_INNER_RE)
      ).map(m => m[1]);

      const rep = matchCtx.repeats.find(r =>
        varsInTemplate.every(v => r.vars.has(v))
      );

      if (!rep) return "";

      return rep.items.map(item => {
        let segment = inner;

        for (const key in item) {
          const re = new RegExp(`\\$${key}\\b`, "g");
          segment = segment.replace(re, item[key]);
        }

        return indent + segment.trim();
      }).join("\n");
    }
  );
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

// function findInvocationSlice(code, startIdx, patternSrc) {
//   const wantsBrace = patternSrc.includes("{") && patternSrc.includes("}");
//   const wantsBracket = patternSrc.includes("[") && patternSrc.includes("]");

//   const startPos =
//     wantsBrace ? code.indexOf("{", startIdx) :
//     wantsBracket ? code.indexOf("[", startIdx) :
//     -1;

//   if (startPos === -1) {
//     const end = code.indexOf("\n", startIdx);
//     return { endIdx: end === -1 ? code.length : end + 1 };
//   }

//   const open = code[startPos];
//   const close = open === "{" ? "}" : "]";

//   let i = startPos;
//   let depth = 0;

//   while (i < code.length) {
//     const ch = code[i];

//     // ignorar strings
//     if (ch === '"' || ch === "'" || ch === "`") {
//       const q = ch;
//       i++;
//       while (i < code.length) {
//         const c2 = code[i];
//         if (c2 === "\\" && i + 1 < code.length) {
//           i += 2;
//           continue;
//         }
//         if (c2 === q) {
//           i++;
//           break;
//         }
//         i++;
//       }
//       continue;
//     }

//     if (ch === open) depth++;
//     if (ch === close) {
//       depth--;
//       if (depth === 0) {
//         const end =
//           (i + 1 < code.length && code[i + 1] === "\n")
//             ? i + 2
//             : i + 1;
//         return { endIdx: end };
//       }
//     }

//     i++;
//   }

//   return { endIdx: code.length };
// }


function indentBlock(text, indent) {
  return text
    .split("\n")
    .map(line => indent + line)
    .join("\n");
}

function expandMacroExpressions(code, macros) {
  let out = "";
  let i = 0;

  while (i < code.length) {
    const idx = code.indexOf("$(", i);
    if (idx === -1) {
      out += code.slice(i);
      break;
    }

    out += code.slice(i, idx);
    i = idx + 2;

    // capturar conteúdo balanceado de (...)
    let depth = 1;
    let expr = "";

    while (i < code.length && depth > 0) {
      const ch = code[i];

      if (ch === "(") depth++;
      else if (ch === ")") depth--;

      if (depth > 0) expr += ch;
      i++;
    }

    // tentar casar macro dentro da expressão
    const tokens = tokenize(expr.trim());
    let replaced = false;

    for (const mac of macros) {
      if (!tokens.length) continue;
      if (tokens[0].k !== "id") continue;
      if (tokens[0].t !== mac.head) continue;

      const res = matchNodes(mac.pattern, tokens, 0);
      if (!res.ok) continue;

      let expanded = expandBody(mac.bodySrc, res);
      expanded = expandMacros(expanded, macros);
      expanded = expandTemplateIdentifiers(expanded, res);
      out += expanded.trim();
      replaced = true;
      break;
    }

    if (!replaced) {
      // se não for macro válida, preserva literal
      out += `$(${expr})`;
    }
  }

  return out;
}


function applyMacrosOnce(code, macros) {
  for (const mac of macros) {
    const headRe = new RegExp(`^([ \\t]*)${escapeRegex(mac.head)}\\b`, "gm");
    let m;

    while ((m = headRe.exec(code)) !== null) {

      const indent = m[1];
      const startIdx = m.index;

      if(DEBUG_REP){
        console.log("\n=== TRY MACRO ===");
        console.log("Macro:", mac.head);
        console.log("StartIdx:", startIdx);
        console.log("Snippet:\n", code.slice(startIdx, startIdx + 120));
        console.log("=================\n");
      }
      const ctx = { scalars: {}, repeats: [] };

      // pular o head já garantido
      const afterHead = startIdx + indent.length + mac.head.length;

      // remover o primeiro node (literal head) do pattern
      const patternWithoutHead = mac.pattern.slice(1);
      if(DEBUG_REP){
        console.log("Pattern FULL:", mac.pattern);
      }

      const res = matchNodesOnSource(
        patternWithoutHead,
        code,
        afterHead,
        ctx
      );
      

      if (!res.ok) {
        console.log("❌ MATCH FAILED for macro:", mac.head);
        console.log("Pattern:", patternWithoutHead);
        console.log("Remaining source:", code.slice(afterHead, afterHead + 120));
        headRe.lastIndex = startIdx + 1;
        continue;
      }

      const endIdx = res.next;

      const hasTrailingNewline =
        endIdx < code.length && code[endIdx] === "\n";

      let expanded = expandBody(mac.bodySrc, ctx).trimEnd();
      expanded = expandMacroExpressions(expanded, macros);


      const withIndent =
        indentBlock(expanded, indent) +
        (hasTrailingNewline ? "\n" : "");
        

      return code.slice(0, startIdx) + withIndent + code.slice(endIdx);
    }
  }

  return code;
}



export function expandMacros(code, macros) {
  let current = code;

  while (true) {
    const next = applyMacrosOnce(current, macros);
    if (next === current) {
      return escapeTemplatesInsideAnnotatedJavascript(next);
    }
    current = next;
  }
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