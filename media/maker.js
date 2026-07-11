import { generateOTF } from './export/otf.js';

window.showPage = (page)=>document.querySelectorAll('main > div').forEach(div=>div.style.display=(div.getAttribute('data-page')===page)?'':'none');
window.showPage('settings');

// Glyphs
let glyphs = [{
  name: '.notdef',
  char: '',
  glyf: [
    { x: 0, y: 0, countourEnd: false, onCurve: true },
    { x: 50, y: 0, countourEnd: false, onCurve: true },
    { x: 50, y: 100, countourEnd: false, onCurve: true },
    { x: 0, y: 100, countourEnd: true, onCurve: true },
    { x: 0, y: 100, countourEnd: false, onCurve: true },
    { x: 0, y: 0, countourEnd: false, onCurve: true },
    { x: 50, y: 100, countourEnd: true, onCurve: true }
  ]
}];
let substitutions = [];
function showGlyphLists() {
  let disp = (gl)=>`<div>
  <span>${JSON.stringify(gl.glyf)}</span>
  <span>${gl.name}</span>
</div>`;
  document.getElementById('glyph-list').innerHTML = glyphs.map(disp).join('');
  document.getElementById('sub-list').innerHTML = substitutions.map(disp).join('');
}
window.createGlyph = ()=>{
  let char = prompt('Character');
  if ([...Intl.Segmenter(undefined, {
    granularity: 'grapheme'
  }).segment(char)].length!==1) {
    alert('Only one grapheme allowed');
    return;
  }
  if (glyphs.findIndex(gl=>gl.char===char)!==-1) {
    alert('Glyph for that char already defined');
    return;
  }
  glyphs.push({
    name: char,
    char: char,
    glyf: glyphs[0].glyf
  });
  showGlyphLists();
};
window.createSub = ()=>{
  let charseq = prompt('Character sequence');
  substitutions.push({
    name: charseq,
    char: charseq,
    glyf: glyphs[0].glyf
  });
  showGlyphLists();
};
showGlyphLists();

// Export
window.exportFont = ()=>{
  generateOTF({
    italicAngle: document.getElementById('style-italicAngle').value,
    underlinePosition: document.getElementById('style-underlinePosition').value,
    underlineThickness: document.getElementById('style-underlineThickness').value,
    monospaced: document.getElementById('style-monospaced').checked,

    family: document.getElementById('string-family').value,
    subfamily: document.getElementById('string-subfamily').value,
    version: document.getElementById('string-version').value,
    copyright: document.getElementById('string-copyright').value,
    designer: document.getElementById('string-designer').value,
    desc: document.getElementById('string-desc').value,
    license: document.getElementById('string-license').value,
    sample: document.getElementById('string-sample').value
  }, glyphs, substitutions);
};
