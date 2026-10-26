// Vessels Events: which screen the audience display goes on. Plug the projector in and it's found: the remembered
// one if it's connected (by id, or by name and size when Windows hands out a new id), else the biggest screen that
// isn't the laptop's own. 'none' (the operator's pick) or no second screen = a preview window on the laptop.
'use strict';

const area = (d) => d.size.width * d.size.height;
const describe = (d, primaryId) => ({
  id: d.id, label: d.label || `Display ${d.id}`, w: d.size.width, h: d.size.height, primary: d.id === primaryId,
  internal: !!d.internal,
});

function pick(displays, primaryId, saved) {
  if (saved && saved.id === 'none') return null;
  if (saved && saved.id != null) {
    const same = displays.find((d) => d.id === saved.id && d.id !== primaryId)
      || displays.find((d) => d.id !== primaryId && saved.label && (d.label || '') === saved.label && d.size.width === saved.w && d.size.height === saved.h);
    if (same) return same;
  }
  const others = displays.filter((d) => d.id !== primaryId && !d.internal);
  const pool = others.length ? others : displays.filter((d) => d.id !== primaryId);
  return pool.sort((a, b) => area(b) - area(a))[0] || null;
}

module.exports = { pick, describe };
