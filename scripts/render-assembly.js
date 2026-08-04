#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');

const input=path.resolve(process.argv[2]||'assembly.json');
const output=path.resolve(process.argv[3]||input.replace(/(?:\.assembly)?\.json$/i,'.svg'));
const documentData=JSON.parse(fs.readFileSync(input,'utf8'));

require(path.resolve(__dirname,'../app.js'));
const svg=globalThis.WireSketchRenderer.renderAssemblyDocumentSvg(documentData);
fs.writeFileSync(output,svg);
process.stdout.write(`${output}\n`);
