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
let glyfStart = 0;
let glyphStarts = [];
let glyfsdata;
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
    glyfStart = offset;
    for (let i=0; i<glyphs.length; i++) {
      glyphStarts.push(offset);
      let minX = 0;
      let minY = 0;
      let maxX = 0;
      let maxY = 0;
      let countourEnds = [];
      glyphs[i].glyf.forEach((pt,idx)=>{
        if (pt.x<minX) minX = pt.x;
        if (pt.x>maxX) maxX = pt.x;
        if (pt.y<minY) minY = pt.y;
        if (pt.y>maxY) maxY = pt.y;
        if (pt.countourEnd) countourEnds.push(idx);
      });
      if (minX<glyfsdata.minX) glyfsdata.minX = minX;
      if (minY<glyfsdata.minY) glyfsdata.minY = minY;
      if (maxX<glyfsdata.maxX) glyfsdata.maxX = maxX;
      if (maxY<glyfsdata.maxY) glyfsdata.maxY = maxY;
      if (maxX-minX>0) {
        glyfsdata.widthSum += maxX-minX;
        glyfsdata.widthCount++;
      }
      view.setInt16(offset, countourEnds.length, false); // numberOfContours
      view.setInt16(offset+2, minX, false); // xMin
      view.setInt16(offset+4, minY, false); // yMin
      view.setInt16(offset+6, maxX, false); // xMax
      view.setInt16(offset+8, maxY, false); // yMax
      offset += 10;
      for (let j=0; j<countourEnds.length; j++) {
        view.setUint16(offset, countourEnds[j], false);
        offset += 2;
      }
      view.setUint16(offset, 0, false); // instructionLength (hinting quite hard)
      offset += 2;
      for (let j=0; j<glyphs[i].glyf.length; j++) {
        view.setUint8(offset, glyphs[i].glyf[j].onCurve?1:0);
        offset++;
      }
      let previous = 0;
      for (let j=0; j<glyphs[i].glyf.length; j++) {
        view.setInt16(offset, glyphs[i].glyf[j].x-previous, false);
        previous = glyphs[i].glyf[j].x;
        offset += 2;
      }
      previous = 0;
      for (let j=0; j<glyphs[i].glyf.length; j++) {
        view.setInt16(offset, glyphs[i].glyf[j].y-previous, false);
        previous = glyphs[i].glyf[j].y;
        offset += 2;
      }
    }
    glyphStarts.push(offset);
    return offset;
  },
  loca: (view, offset, settings, glyphs, substitutions)=>{
    for (let i=0; i<glyphStarts.length; i++) {
      view.setUint32(offset, glyphStarts[i]-glyfStart, false);
      offset += 4;
    }
    glyfStart = 0;
    glyphStarts = [];
    return offset;
  },
  maxp: (view, offset, settings, glyphs, substitutions)=>{
    view.setUint32(offset, 0x10000, false); // version
    let maxPoints = 0;
    let maxContours = 0;
    glyphs.forEach(gl=>{
      if (gl.glyf.length>maxPoints) maxPoints = gl.glyf.length;
      let countours = 0;
      gl.glyf.forEach(pt=>{
        if (pt.countourEnd) countours++;
      });
      if (countours>maxContours) maxContours = countours;
    });
    view.setUint16(offset+4, glyphs.length, false); // numGlyphs
    view.setUint16(offset+6, maxPoints, false); // maxPoints
    view.setUint16(offset+8, maxContours, false); // maxContours
    view.setUint16(offset+10, 0, false); // maxCompositePoints
    view.setUint16(offset+12, 0, false); // maxCompositeContours
    // TODO: Everything below
    view.setUint16(offset+14, 0, false); // maxZones
    view.setUint16(offset+16, 0, false); // maxTwilightPoints
    view.setUint16(offset+18, 0, false); // maxStorage
    view.setUint16(offset+20, 0, false); // maxFunctionDefs
    view.setUint16(offset+22, 0, false); // maxInstructionDefs
    view.setUint16(offset+24, 0, false); // maxStackElements
    view.setUint16(offset+26, 0, false); // maxSizeOfInstructions
    view.setUint16(offset+28, 0, false); // maxComponentElements
    view.setUint16(offset+30, 0, false); // maxComponentDepth
    offset += 32;
/*
uint16	maxZones	1 if instructions do not use the twilight zone (Z0), or 2 if instructions do use Z0; should be set to 2 in most cases.
uint16	maxTwilightPoints	Maximum points used in Z0.
uint16	maxStorage	Number of Storage Area locations.
uint16	maxFunctionDefs	Number of FDEFs, equal to the highest function number + 1.
uint16	maxInstructionDefs	Number of IDEFs.
uint16	maxStackElements	Maximum stack depth across Font Program ('fpgm' table), CVT Program ('prep' table) and all glyph instructions (in the 'glyf' table).
uint16	maxSizeOfInstructions	Maximum byte count for glyph instructions.
uint16	maxComponentElements	Maximum number of components referenced at “top level” for any composite glyph.
uint16	maxComponentDepth	Maximum levels of recursion; 1 for simple components.*/
    return offset;
  },
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
  'OS/2': (view, offset, settings, glyphs, substitutions)=>{
    view.setUint16(offset, 5, false); // version
    view.setUint16(offset+2, 0, false); // minorVersion
    view.setInt16(offset+4, Math.ceil(glyfsdata.widthSum/glyfsdata.widthCount), false); // xAvgCharWidth
    view.setUint16(offset+6, settings.weight, false); // usWeightClass
    view.setUint16(offset+8, settings.width, false); // usWidthClass
    view.setUint16(offset+10, 0, false); // fsType (Sharing is caring)
    view.setInt16(offset+12, settings.subXSize, false); // ySubscriptXSize
    view.setInt16(offset+14, settings.subYSize, false); // ySubscriptYSize
    view.setInt16(offset+16, settings.subXOff, false); // ySubscriptXOffset
    view.setInt16(offset+18, settings.subYOff, false); // ySubscriptYOffset
    view.setInt16(offset+20, settings.supXSize, false); // ySuperscriptXSize
    view.setInt16(offset+22, settings.supYSize, false); // ySuperscriptYSize
    view.setInt16(offset+24, settings.supXOff, false); // ySuperscriptXOffset
    view.setInt16(offset+26, settings.supYOff, false); // ySuperscriptYOffset
    view.setInt16(offset+28, settings.strikeThickness, false); // yStrikeoutSize
    view.setInt16(offset+30, settings.strikePosition, false); // yStrikeoutPosition
    view.setInt16(offset+32, 0, false); // TODO: sFamilyClass
    // TODO: panose
    view.setUint8(offset+34, 0, false);
    view.setUint8(offset+35, 0, false);
    view.setUint8(offset+36, 0, false);
    view.setUint8(offset+37, 0, false);
    view.setUint8(offset+38, 0, false);
    view.setUint8(offset+39, 0, false);
    view.setUint8(offset+40, 0, false);
    view.setUint8(offset+41, 0, false);
    view.setUint8(offset+42, 0, false);
    view.setUint8(offset+43, 0, false);
    // ulUnicodeRange (not needed)
    view.setUint32(offset+44, 0, false);
    view.setUint32(offset+48, 0, false);
    view.setUint32(offset+52, 0, false);
    view.setUint32(offset+56, 0, false);
    offset += 60;
/*
Tag	achVendID	
uint16	fsSelection	
uint16	usFirstCharIndex	
uint16	usLastCharIndex	
FWORD	sTypoAscender	
FWORD	sTypoDescender	
FWORD	sTypoLineGap	
UFWORD	usWinAscent	
UFWORD	usWinDescent	
uint32	ulCodePageRange1	Bits 0 – 31
uint32	ulCodePageRange2	Bits 32 – 63
FWORD	sxHeight	
FWORD	sCapHeight	
uint16	usDefaultChar	
uint16	usBreakChar	
uint16	usMaxContext	
uint16	usLowerOpticalPointSize	
uint16	usUpperOpticalPointSize*/
    return offset;
  },
  head: (view, offset, settings, glyphs, substitutions)=>{
    view.setUint16(offset, 1, false); // majorVersion
    view.setUint16(offset+2, 0, false); // minorVersion
    let version = (settings.version||'Version 1.0').split(' ').slice(-1)[0].split('.');
    view.setInt16(offset+4, parseInt(version[0]||'1'), false); // fontRevision
    view.setUint16(offset+6, parseInt(version[1]||'0'), false); // fontRevision
    view.setUint32(offset+8, 0, false); // TODO: checksumAdjustment
    view.setUint32(offset+12, 0x5F0F3CF5, false); // magicNumber
    view.setUint16(offset+16, 0, false); // TODO: flags
/*
Bit 0: Baseline for font at y=0.
Bit 1: Left sidebearing point at x=0 (relevant only for TrueType rasterizers).
*/
    view.setUint16(offset+18, 256, false); // TODO: unitsPerEm
    view.setBigInt64(offset+20, BigInt(Math.floor(Date.now()/1000))+2082844800n, false); // created
    view.setBigInt64(offset+28, BigInt(Math.floor(Date.now()/1000))+2082844800n, false); // modified
    view.setInt16(offset+36, glyfsdata.minX, false); // xMin
    view.setInt16(offset+38, glyfsdata.minY, false); // yMin
    view.setInt16(offset+40, glyfsdata.maxX, false); // xMax
    view.setInt16(offset+42, glyfsdata.maxY, false); // yMax
    view.setUint16(offset+44, (settings.weight>650?1:0)+(settings.italic?2:0)+(settings.underline?4:0)+(settings.outline?8:0)+(settings.shadow?16:0)+(settings.width<4?32:0)+(settings.width>6?64:0), false); // macStyle
    view.setUint16(offset+46, 0, false); // TODO: lowestRecPPEM
    view.setInt16(offset+48, 2, false); // fontDirectionHint
    view.setInt16(offset+50, 1, false); // indexToLocFormat
    view.setInt16(offset+52, 0, false); // glyphDataFormat
    offset += 54;
/*
uint32	checksumAdjustment	To compute: set it to 0, sum the entire font as uint32, then store 0xB1B0AFBA - sum.
uint16	unitsPerEm	Set to a value from 16 to 16384. Any value in this range is valid. In fonts that have TrueType outlines, a power of 2 is recommended as this allows performance optimization in some rasterizers.
uint16	lowestRecPPEM	Smallest readable size in pixels.*/
    return offset;
  },
  hhea: (view, offset, settings, glyphs, substitutions)=>offset,
  hmtx: (view, offset, settings, glyphs, substitutions)=>offset
};

export function generateOTF(settings, glyphs, substitutions) {
  const buffer = new ArrayBuffer(4096);
  const view = new DataView(buffer);
  let offset = 0;

  let tables = [
    'cmap',
    'glyf',
    'loca',
    'maxp',
    'name',
    'post',
    'OS/2',
    'head',
    'hhea',
    'hmtx'
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

  glyfsdata = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    widthSum: 0,
    widthCount: 0
  };
  for (let i=0; i<tables.length; i++) {
    offset = align4(offset);
    let start = offset;
    offset = tableGen[tables[i]](view, offset, settings, glyphs, substitutions);
    let headoffset = directoryStart+(16*i);
    view.setUint32(headoffset+12, offset-start, false);
    view.setUint32(headoffset+8, start, false);
    view.setUint32(headoffset+4, getChecksum(view, start, offset-start), false);
  }

  return view;
}
