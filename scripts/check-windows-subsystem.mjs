import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/check-windows-subsystem.mjs <bbforge-app.exe>");
const exe = readFileSync(file);
if (exe.toString("ascii", 0, 2) !== "MZ") throw new Error(`${file}: not a PE executable`);
const pe = exe.readUInt32LE(0x3c);
if (exe.toString("ascii", pe, pe + 4) !== "PE\0\0") throw new Error(`${file}: invalid PE header`);
const optional = pe + 24;
const magic = exe.readUInt16LE(optional);
if (magic !== 0x10b && magic !== 0x20b) throw new Error(`${file}: unknown optional header`);
const subsystem = exe.readUInt16LE(optional + 68);
if (subsystem !== 2) {
  throw new Error(`${file}: PE subsystem is ${subsystem}; expected 2 (Windows GUI), otherwise BBForge opens a console window`);
}
console.log(`${file}: Windows GUI subsystem`);
