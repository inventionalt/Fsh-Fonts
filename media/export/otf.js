// https://learn.microsoft.com/en-us/typography/opentype/spec/otff

const align4 = (x)=>(x+3) & ~3;
const fl2 = (x)=>Math.floor(Math.log2(x));

function getChecksum(view, offset, length) {
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
    offset = align4(offset);
    const start = offset;
    let subtable4glyphs = glyphs.filter(gl=>gl.name.length===1&&gl.name.codePointAt(0)<=0xFFFF);
    let subtable12glyphs = glyphs.filter(gl=>gl.name.length===1&&gl.name.codePointAt(0)>0xFFFF);
    let subtable14glyphs = glyphs.filter(gl=>gl.name.length>1);

    view.setUint16(offset, 0, false); // version
    offset += 2;
    view.setUint16(offset, (subtable4glyphs.length>0?1:0)+(subtable12glyphs.length>0?1:0)+(subtable14glyphs.length>0?1:0), false); // numTables
    offset += 2;

    let subtableIdxStart = offset;
    let subtable = (encoding)=>{
      view.setUint16(offset, 0, false); // platformID
      view.setUint16(offset+2, encoding, false); // encodingID
      view.setUint32(offset+4, 0, false); // subtableOffset (Temp)
      offset += 8;
    };
    if (has4subtable) subtable(3);
    if (has12subtable) subtable(4);
    if (has14subtable) subtable(5);

    if (has4subtable) {
      view.setUint16(offset, 4, false); // format
      view.setUint16(offset+2, 0, false); // TODO: length
      view.setUint16(offset+4, 0, false); // language
      offset += 6;
      let segCount = subtable4glyphs.length+1; // Optimize segments if you want, but im not doing that
      let entrySelector = fl2(segCount);
      let searchRange = (1<<entrySelector)*2;
      view.setUint16(offset, segCount*2, false); // segCountX2
      view.setUint16(offset+2, searchRange, false); // searchRange
      view.setUint16(offset+4, entrySelector, false); // entrySelector
      view.setUint16(offset+6, segCount*2-searchRange, false); // rangeShift
      offset += 8;
      for (let i=0; i<segCount; i++) {
        view.setUint16(offset, subtable4glyphs[i].codePointAt(0), false); // endCode
        offset += 2;
      }
      view.setUint16(offset, 0, false); // reserved
      offset += 2;
      for (let i=0; i<segCount; i++) {
        view.setUint16(subtable4glyphs[i].codePointAt(0), 0, false); // startCode
        offset += 2;
      }
      for (let i=0; i<segCount; i++) {
        view.setInt16(offset, 0, false); // TODO: idDelta
        offset += 2;
      }
      for (let i=0; i<segCount; i++) {
        view.setUint16(offset, 0, false); // TODO: idRangeOffset
        offset += 2;
      }
/*
uint16	endCode[segCount]	End characterCode for each segment, last=0xFFFF.
uint16	reservedPad	Set to 0.
uint16	startCode[segCount]	Start character code for each segment.
int16	idDelta[segCount]	Delta for all character codes in segment.
uint16	idRangeOffset[segCount]	Offsets into glyphIdArray or 0
uint16	glyphIdArray[ ]	Glyph index array (arbitrary length)*/
    }
    /*view.setUint16(offset, 14, false); // format
    offset += 2;
    view.setUint32(offset, 0, false); // TODO: length
    offset += 4;
    view.setUint32(offset, 0, false); // TODO: numVarSelectorRecords
    offset += 4;*/

    return {
      start,
      offset,
      length: offset-start
    };
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

  let entrySelector = fl2(tables.length);
  let searchRange = (1<<entrySelector)*16;
  let rangeShift = tables.length*16-searchRange;

  view.setUint32(offset, 0x00010000, false); // sfntVersion (currently set for TrueType outlines)
  view.setUint16(offset+4, tables.length, false); // numTables
  view.setUint16(offset+6, searchRange, false); // searchRange
  view.setUint16(offset+8, entrySelector, false); // entrySelector
  view.setUint16(offset+10, rangeShift, false); // rangeShift
  offset += 12;

  const directoryStart = offset;
  for (let i=0; i<tables.length; i++) {
    for (let j=0; j<4; j++) view.setUint8(offset+j, tables[i].charCodeAt(j));
    offset += 4;

    // Temp data
    view.setUint32(offset, 0, false);
    view.setUint32(offset+4, 0, false);
    view.setUint32(offset+8, 0, false);
    offset += 12;
  }

  for (let i=0; i<tables.length; i++) {
    let ret = tableGen[tables[i]](view, offset, glyphs, substitutions);
    offset = directoryStart+(16*i);
    view.setUint32(offset+12, ret.length, false);
    view.setUint32(offset+8, ret.start, false);
    view.setUint32(offset+4, getChecksum(view, ret.start, ret.length), false);
    offset = ret.offset;
  }
}
