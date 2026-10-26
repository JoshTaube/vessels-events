// VLPATCH - anchored text patches against files we do not own.
//
// build-event.js edits prod surfaces that keep changing. The contract here is
// that failure is LOUD. A patch whose anchor has moved stops the build; it is
// never skipped quietly, because a skipped patch means the event build behaves
// like normal Vessels - players voting, no audience - and the first place
// anyone would notice is on stage.
//
// An anchor matching TWICE is also an error. In a 14,000-line file, picking the
// first of two matches is a coin flip, and the wrong one is the kind of bug
// that survives every test and surfaces in front of an audience.
(function (root) {
  'use strict';

  const P = {};

  function count(hay, needle) {
    let n = 0, i = 0;
    for (;;) {
      const at = hay.indexOf(needle, i);
      if (at < 0) return n;
      n++; i = at + needle.length;
    }
  }

  // Apply one patch. Returns {text, status} where status is
  // 'applied' | 'already' | 'skipped'.
  P.one = function (text, p) {
    if (p.applied && text.indexOf(p.applied) >= 0 && text.indexOf(p.find) < 0) {
      return { text: text, status: 'already' };
    }
    const n = count(text, p.find);
    if (n === 0) {
      if (p.optional) return { text: text, status: 'skipped' };
      throw new Error('patch "' + p.name + '": anchor not found. Prod has changed shape; '
        + 'update the anchor rather than shipping this file unpatched.\n  looking for: '
        + JSON.stringify(p.find.slice(0, 120)));
    }
    if (n > 1) {
      throw new Error('patch "' + p.name + '": anchor is ambiguous, found ' + n
        + ' times. Lengthen it until it is unique - guessing which one to take is '
        + 'how a wrong edit reaches a live show.\n  looking for: '
        + JSON.stringify(p.find.slice(0, 120)));
    }
    return { text: text.replace(p.find, function () { return p.replace; }), status: 'applied' };
  };

  P.apply = function (text, patches) {
    return P.report('(text)', text, patches).text;
  };

  P.report = function (file, text, patches) {
    const applied = [], skipped = [], already = [];
    for (const p of patches) {
      const r = P.one(text, p);
      text = r.text;
      if (r.status === 'applied') applied.push(p.name);
      else if (r.status === 'skipped') skipped.push(p.name);
      else already.push(p.name);
    }
    return { file: file, text: text, applied: applied, skipped: skipped, already: already };
  };

  root.VLPATCH = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
