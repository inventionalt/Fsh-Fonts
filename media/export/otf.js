// https://learn.microsoft.com/en-us/typography/opentype/spec/otff

const align4 = (x)=>(x+3) & ~3;

function getChecksum(buffer, offset, length) {
  const view = new DataView(buffer);

  let sum = 0;
  let padded = align4(length);

  for (let i = 0; i < padded; i += 4) {
    let word = 0;
    if (i < length) word |= view.getUint8(offset+i) << 24;
    if (i+1 < length) word |= view.getUint8(offset+i+1) << 16;
    if (i+2 < length) word |= view.getUint8(offset+i+2) << 8;
    if (i+3 < length) word |= view.getUint8(offset+i+3);

    sum = (sum + (word >>> 0)) >>> 0;
  }

  return sum >>> 0;
}

// Tables
const tableGen = {
  cmap: (view, offset, glyphs, substitutions)=>{
    view.setUint16(offset, 0, false); // version
    offset += 2;
    view.setUint16(offset, 1, false); // numTables (think one unicode is enough, we def need more)
    offset += 2;

    view.setUint16(offset, 0, false); // platformID
    offset += 2;
    view.setUint16(offset, 5, false); // encodingID
    offset += 2;
    view.setUint32(offset, 12, false); // subtableOffset
    offset += 4;

    view.setUint16(offset, 14, false); // format
    offset += 2;
    view.setUint32(offset, 0, false); // TODO: length
    offset += 4;
    view.setUint32(offset, 0, false); // TODO: numVarSelectorRecords
    offset += 4;
  }
};

export function generateOTF(glyphs, substitutions) {
  const buffer = new ArrayBuffer(4096);
  const view = new DataView(buffer);
  let offset = 0;

  let tables = [
    'cmap',
    'glyf',
    'OS/2',
    'head',
    'hhea',
    'hmtx',
    'loca',
    'maxp',
    'name',
    'post'
  ];
  if (substitutions.length) tables.push('GSUB')

  let entrySelector = Math.floor(Math.log2(tables.length));
  let searchRange = (1<<entrySelector)*16;
  let rangeShift = tables.length*16-searchRange;

  view.setUint32(offset, 0x00010000, false); // sfntVersion (currently set for TrueType outlines)
  offset += 4;
  view.setUint16(offset, tables.length, false); // numTables
  offset += 2;
  view.setUint16(offset, searchRange, false); // searchRange
  offset += 2;
  view.setUint16(offset, entrySelector, false); // entrySelector
  offset += 2;
  view.setUint16(offset, rangeShift, false); // rangeShift
  offset += 2;

  const directoryStart = offset;
  for (let i=0; i<tables.length; i++) {
    for (let j=0; j<4; j++) view.setUint8(offset+j, tables[i].charCodeAt(j));
    offset += 4;

    // Temp data
    view.setUint32(offset, 0, false);
    offset += 4;
    view.setUint32(offset, 0, false);
    offset += 4;
    view.setUint32(offset, 0, false);
    offset += 4;
  }


}
