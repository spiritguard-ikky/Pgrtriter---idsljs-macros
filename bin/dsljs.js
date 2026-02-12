#!/usr/bin/env node
import fs from "fs";
import path from "path";
import chokidar from "chokidar";

import {
  stripMacrosBlock,
  parseMacrosFromBlock,
  expandMacros
} from "../src/parser.js";

import vm from "node:vm";
import { createRequire } from "node:module";
import process from "node:process";


/* ─────────────────────────────
   Utils
───────────────────────────── */

let currentContext = null;

function runInVm(inputFile, argv = []) {
  const source = fs.readFileSync(inputFile, "utf8");

  const { macrosBlock, output: code } = stripMacrosBlock(source);
  const macros = parseMacrosFromBlock(macrosBlock);
  const expanded = expandMacros(code, macros);

  const filename = path.resolve(inputFile);
  const dirname = path.dirname(filename);
  const require = createRequire(filename);

  // invalida execução anterior
  if (currentContext?.__dispose) {
    try { currentContext.__dispose(); } catch {}
  }

  const context = {
    console,
    require,
    __filename: filename,
    __dirname: dirname,
    module: { exports: {} },
    exports: {},
    process: {
      ...process,
      argv: [process.argv[0], filename, ...argv],
      exit: () => {} // bloqueia exit do script
    },
    __dispose: null
  };

  vm.createContext(context);

  // hook opcional de cleanup
  Object.defineProperty(context, "__dispose", {
    value: () => {
      if (context.module?.exports?.dispose) {
        context.module.exports.dispose();
      }
    }
  });

  currentContext = context;

  const script = new vm.Script(expanded, {
    filename,
    displayErrors: true
  });

  console.log("▶ executing...");
  script.runInContext(context);
  console.log("✔ execution finished");
}


function runFile(inputFile, argv = []) {
  const source = fs.readFileSync(inputFile, "utf8");

  const { macrosBlock, output: code } = stripMacrosBlock(source);
  const macros = parseMacrosFromBlock(macrosBlock);
  const expanded = expandMacros(code, macros);

  const filename = path.resolve(inputFile);
  const dirname = path.dirname(filename);

  const require = createRequire(filename);

  const context = {
    console,
    process: {
      ...process,
      argv: [process.argv[0], filename, ...argv]
    },
    require,
    __filename: filename,
    __dirname: dirname,
    module: { exports: {} },
    exports: {}
  };

  vm.createContext(context);

  const script = new vm.Script(expanded, {
    filename,
    displayErrors: true
  });

  script.runInContext(context);
}

function compileFile(inputFile, outputFile) {
  const source = fs.readFileSync(inputFile, "utf8");
  const { macrosBlock, output: code } = stripMacrosBlock(source);
  const macros = parseMacrosFromBlock(macrosBlock);
  const expanded = expandMacros(code, macros);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, expanded, "utf8");

  console.log("✔", inputFile, "→", outputFile);
}

function isDslFile(file) {
  return file.endsWith(".dsl.js");
}

function isFile(p) {
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

function isDir(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}


/* ─────────────────────────────
   DIST
───────────────────────────── */

function distDir(srcDir, outDir) {
  const files = fs.readdirSync(srcDir, { recursive: true });

  for (const file of files) {
    const full = path.join(srcDir, file);
    if (!isDslFile(full)) continue;

    const rel = path.relative(srcDir, full);
    const out = path.join(outDir, rel.replace(".dsl.js", ".js"));

    compileFile(full, out);
  }
}

/* ─────────────────────────────
   WATCH
───────────────────────────── */

function watchDir(srcDir, outDir) {
  console.log("🔍 Watching:", srcDir);

  chokidar.watch(srcDir, { ignoreInitial: false })
    .on("add", file => {
      if (isDslFile(file)) {
        const rel = path.relative(srcDir, file);
        const out = path.join(outDir, rel.replace(".dsl.js", ".js"));
        compileFile(file, out);
      }
    })
    .on("change", file => {
      if (isDslFile(file)) {
        const rel = path.relative(srcDir, file);
        const out = path.join(outDir, rel.replace(".dsl.js", ".js"));
        compileFile(file, out);
      }
    });
}

function watchFile(inputFile, outputFile) {
  console.log("🔍 Watching file:", inputFile);

  const compile = () => compileFile(inputFile, outputFile);

  // compila uma vez ao iniciar
  compile();

  chokidar.watch(inputFile, { ignoreInitial: true })
    .on("change", () => {
      compile();
    });
}

function watchRunFile(inputFile, argv = []) {
  console.log("🚀 watch-run iniciado:", inputFile);

  const run = () => {
    try {
      runInVm(inputFile, argv);
    } catch (err) {
      console.error("✖ runtime error\n", err);
    }
  };

  run();

  chokidar.watch(inputFile, { ignoreInitial: true })
    .on("change", () => {
      console.log("♻ restarting...");
      run();
    });
}


/* ─────────────────────────────
   CLI
───────────────────────────── */

const [, , cmd, a, b] = process.argv;
function main() {
  const [, , cmd, a, b] = process.argv;

  if (!cmd) {
    console.error("Uso:");
    console.error("  dsljs <entrada.dsl.js> [saida.js]");
    console.error("  dsljs dist <srcDir> <outDir>");
    console.error("  dsljs watch <src> <out>");
    process.exit(1);
  }

  if (cmd === "dist") {
    if (!a || !b) {
      console.error("Uso: dsljs dist <srcDir> <outDir>");
      process.exit(1);
    }
    distDir(a, b);
    process.exit(0);
  }

  if (cmd === "watch") {
    if (!a || !b) {
      console.error("Uso: dsljs watch <src> <out>");
      process.exit(1);
    }

    if (isFile(a)) {
      watchFile(a, b);
      return; // ✅ agora é válido
    }

    if (isDir(a)) {
      watchDir(a, b);
      return; // ✅ agora é válido
    }

    console.error("Caminho inválido:", a);
    process.exit(1);
  }

  if (cmd === "watch-run") {
    if (!a) {
      console.error("Uso: dsljs watch-run <arquivo.dsl.js> [...args]");
      process.exit(1);
    }

    const extraArgs = process.argv.slice(4);
    watchRunFile(a, extraArgs);
    return;
  }


  if (cmd === "run") {
    if (!a) {
      console.error("Uso: dsljs run <arquivo.dsl.js> [...args]");
      process.exit(1);
    }

    const extraArgs = process.argv.slice(4);
    runFile(a, extraArgs);
    return;
  }


  /* modo arquivo único */
  const input = cmd;
  const output = a;

  const source = fs.readFileSync(input, "utf8");
  const { macrosBlock, output: code } = stripMacrosBlock(source);
  const macros = parseMacrosFromBlock(macrosBlock);
  const expanded = expandMacros(code, macros);

  if (output) {
    fs.writeFileSync(output, expanded, "utf8");
  } else {
    console.log(expanded);
  }
}

main();
