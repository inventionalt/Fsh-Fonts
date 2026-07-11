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
  cmap: (view, offset, settings, glyphs, substitutions)=>{
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
  glyf: (view, offset, settings, glyphs, substitutions)=>{
/*int16	numberOfContours	If the number of contours is greater than or equal to zero, this is a simple glyph. If negative, this is a composite glyph — the value -1 should be used for composite glyphs.
int16	xMin	Minimum x for coordinate data.
int16	yMin	Minimum y for coordinate data.
int16	xMax	Maximum x for coordinate data.
int16	yMax	Maximum y for coordinate data.*/
  },
  maxp: (view, offset, settings, glyphs, substitutions)=>offset,
  name: (view, offset, settings, glyphs, substitutions)=>{
    let tableStart = offset;
    view.setUint16(offset, 1, false); // version
    let count = (settings.family.length>0)+(settings.subfamily.length>0)+(settings.version.length>0)+(settings.copyright.length>0)+(settings.designer.length>0)+(settings.desc.length>0)+(settings.license.length>0)+(settings.sample.length>0);
    view.setUint16(offset+2, count, false); // count
    view.setUint16(offset+4, 0, false); // storageOffset (temp)
    offset += 6;
    let recordStarts = offset;
    let putPlat = (id, str)=>{
      view.setUint16(offset, 0, false); // platformID
      view.setUint16(offset+2, 4, false); // encodingID
      view.setUint16(offset+4, 0, false); // languageID
      view.setUint16(offset+6, id, false); // nameID
      view.setUint16(offset+8, str.length*2, false); // length
      view.setUint16(offset+10, 0, false); // stringOffset (temp)
      offset += 12;
    };
    if (settings.family.length>0) putPlat(1, settings.family);
    if (settings.subfamily.length>0) putPlat(2, settings.subfamily);
    if (settings.family.length>0&&settings.subfamily.length>0) putPlat(4, settings.family+' '+settings.subfamily);
    if (settings.version.length>0) putPlat(5, settings.version);
    if (settings.copyright.length>0) putPlat(0, settings.copyright);
    if (settings.designer.length>0) putPlat(9, settings.designer);
    if (settings.desc.length>0) putPlat(10, settings.desc);
    if (settings.license.length>0) putPlat(13, settings.license);
    if (settings.sample.length>0) putPlat(19, settings.sample);
    view.setUint16(offset, 0, false); // langTagCount (languages aren't real)
    offset += 2;
    view.setUint16(tableStart+4, offset-tableStart, false);
    let storageStart = offset;
    let writeString = (str)=>{
      view.setUint16(recordStarts+10, offset-storageStart, false);
      recordStarts += 12;
      for (let i = 0; i < str.length; i++) {
        view.setUint16(offset, str.charCodeAt(i), false);
        offset += 2;
      }
    };
    if (settings.family.length>0) writeString(settings.family);
    if (settings.subfamily.length>0) writeString(settings.subfamily);
    if (settings.family.length>0&&settings.subfamily.length>0) writeString(settings.family+' '+settings.subfamily);
    if (settings.version.length>0) writeString(settings.version);
    if (settings.copyright.length>0) writeString(settings.copyright);
    if (settings.designer.length>0) writeString(settings.designer);
    if (settings.desc.length>0) writeString(settings.desc);
    if (settings.license.length>0) writeString(settings.license);
    if (settings.sample.length>0) writeString(settings.sample);
    return offset;
  },
  post: (view, offset, settings, glyphs, substitutions)=>{
    view.setUint32(offset, 0x30000, false); // version
    view.setInt16(offset+4, Math.trunc(settings.italicAngle), false); // italicAngle
    view.setUint16(offset+6, parseInt(settings.italicAngle.toString().split('.')[1]), false);
    view.setInt16(offset+8, settings.underlinePosition, false); // underlinePosition
    view.setInt16(offset+10, settings.underlineThickness, false); // underlineThickness
    view.setUint32(offset+12, settings.monospaced?0:1, false); // isFixedPitch
    view.setUint32(offset+16, 0, false); // minMemType42
    view.setUint32(offset+20, 0, false); // maxMemType42
    view.setUint32(offset+24, 0, false); // minMemType1
    view.setUint32(offset+28, 0, false); // maxMemType1
    offset += 32;
    return offset;
  },
  'OS/2': (view, offset, settings, glyphs, substitutions)=>offset,
  head: (view, offset, settings, glyphs, substitutions)=>offset,
  hhea: (view, offset, settings, glyphs, substitutions)=>offset,
  hmtx: (view, offset, settings, glyphs, substitutions)=>offset,
  loca: (view, offset, settings, glyphs, substitutions)=>offset
};

export function generateOTF(settings, glyphs, substitutions) {
  const buffer = new ArrayBuffer(4096);
  const view = new DataView(buffer);
  let offset = 0;

  let tables = [
    'cmap',
    'glyf',
    'maxp',
    'name',
    'post',
    'OS/2',
    'head',
    'hhea',
    'hmtx',
    'loca'
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
    offset = tableGen[tables[i]](view, offset, settings, glyphs, substitutions);
    let headoffset = directoryStart+(16*i);
    view.setUint32(headoffset+12, offset-start, false);
    view.setUint32(headoffset+8, start, false);
    view.setUint32(headoffset+4, getChecksum(view, start, offset-start), false);
  }
}
