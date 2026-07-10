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
    let subtable4glyphs = glyphs.filter(gl=>gl.char.length===1&&gl.char.codePointAt(0)<=0xFFFF);
    let subtable12glyphs = glyphs.filter(gl=>gl.char.length===1&&gl.char.codePointAt(0)>0xFFFF);
    let subtable14glyphs = glyphs.filter(gl=>gl.char.length>1);

    view.setUint16(offset, 0, false); // version
    view.setUint16(offset+2, (subtable4glyphs.length>0?1:0)+(subtable12glyphs.length>0?1:0)+(subtable14glyphs.length>0?1:0), false); // numTables
    offset += 4;

    let subtableIdxStart = offset;
    let subtable = (encoding)=>{
      view.setUint16(offset, 0, false); // platformID
      view.setUint16(offset+2, encoding, false); // encodingID
      view.setUint32(offset+4, 0, false); // subtableOffset (Temp)
      offset += 8;
    };
    if (subtable4glyphs.length>0) subtable(3);
    if (subtable12glyphs.length>0) subtable(4);
    if (subtable14glyphs.length>0) subtable(5);

    if (subtable4glyphs.length>0) {
      let subtableStart = offset;
      view.setUint16(offset, 4, false); // format
      view.setUint16(offset+2, 0, false); // length (Temp)
      view.setUint16(offset+4, 0, false); // language
      offset += 6;
      let segCount = subtable4glyphs.length; // Optimize segments if you want, but im not doing that
      let entrySelector = fl2(segCount);
      let searchRange = (1<<entrySelector)*2;
      view.setUint16(offset, segCount*2, false); // segCountX2
      view.setUint16(offset+2, searchRange, false); // searchRange
      view.setUint16(offset+4, entrySelector, false); // entrySelector
      view.setUint16(offset+6, segCount*2-searchRange, false); // rangeShift
      offset += 8;
      for (let i=1; i<segCount; i++) {
        view.setUint16(offset, subtable4glyphs[i].char.codePointAt(0), false); // endCode
        offset += 2;
      }
      view.setUint16(offset, 0xFFFF, false);
      offset += 2;
      view.setUint16(offset, 0, false); // reserved
      offset += 2;
      for (let i=1; i<segCount; i++) {
        view.setUint16(subtable4glyphs[i].char.codePointAt(0), 0, false); // startCode
        offset += 2;
      }
      view.setUint16(offset, 0xFFFF, false);
      offset += 2;
      for (let i=1; i<segCount; i++) {
        view.setInt16(offset, (glyphs.findIndex(gl=>gl.char===subtable4glyphs[i].char)-subtable4glyphs[i].char.codePointAt(0)), false); // idDelta
        offset += 2;
      }
      view.setUint16(offset, 1, false);
      offset += 2;
      for (let i=0; i<segCount; i++) {
        view.setUint16(offset, 0, false); // idRangeOffset
        offset += 2;
      }
      view.setUint16(subtableStart+2, offset-subtableStart, false); // length
    }
    // TODO: Subtables 12/14

    return offset;
  },
  glyf: (view, offset, glyphs, substitutions)=>{
/*int16	numberOfContours	If the number of contours is greater than or equal to zero, this is a simple glyph. If negative, this is a composite glyph — the value -1 should be used for composite glyphs.
int16	xMin	Minimum x for coordinate data.
int16	yMin	Minimum y for coordinate data.
int16	xMax	Maximum x for coordinate data.
int16	yMax	Maximum y for coordinate data.*/
  },
  maxp: (view, offset, glyphs, substitutions)=>offset,
  'OS/2': (view, offset, glyphs, substitutions)=>offset,
  head: (view, offset, glyphs, substitutions)=>offset,
  hhea: (view, offset, glyphs, substitutions)=>offset,
  hmtx: (view, offset, glyphs, substitutions)=>offset,
  loca: (view, offset, glyphs, substitutions)=>offset,
  name: (view, offset, glyphs, substitutions)=>offset,
  post: (view, offset, glyphs, substitutions)=>offset
};

export function generateOTF(glyphs, substitutions) {
  const buffer = new ArrayBuffer(4096);
  const view = new DataView(buffer);
  let offset = 0;

  let tables = [
    'cmap',
    'glyf',
    'maxp',
    'OS/2',
    'head',
    'hhea',
    'hmtx',
    'loca',
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
    offset = align4(offset);
    let start = offset;
    offset = tableGen[tables[i]](view, offset, glyphs, substitutions);
    let headoffset = directoryStart+(16*i);
    view.setUint32(headoffset+12, offset-start, false);
    view.setUint32(headoffset+8, start, false);
    view.setUint32(headoffset+4, getChecksum(view, start, offset-start), false);
  }
}
