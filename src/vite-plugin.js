import fs from "node:fs";
import path from "node:path";
import {
  stripMacrosBlock,
  parseMacrosFromBlock,
  expandMacros
} from "./parser.js";

const PREFIX = "\0dsljs:";

function cleanImporter(importer) {
  if (!importer) return null;
  if (importer.startsWith(PREFIX)) {
    return importer.slice(PREFIX.length);
  }
  return importer;
}

export default function dsljsPlugin(options = {}) {
  return {
    name: "dsljs",
    enforce: "pre",

    resolveId(id, importer) {
      // evita loop infinito
      if (id.startsWith(PREFIX)) return id;

      if (!id.endsWith(".dsljs")) return null;

      const base = cleanImporter(importer);

      const resolved = base
        ? path.resolve(path.dirname(base), id)
        : path.resolve(id);

      return PREFIX + resolved;
    },

    load(id) {
      if (!id.startsWith(PREFIX)) return null;

      const realPath = id.slice(PREFIX.length);

      if (realPath.includes("dsljs:") || realPath.includes("\0")) {
        throw new Error("[DSLJS] corrupted path: " + realPath);
      }

      const source = fs.readFileSync(realPath, "utf8");

      const { macrosBlock, output: code } = stripMacrosBlock(source);
      const macros = parseMacrosFromBlock(macrosBlock);
      const expanded = expandMacros(code, macros);

      return {
        code: expanded,
        map: null
      };
    }
  };
}