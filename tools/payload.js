'use strict';
/**
 * payload.js — edits the prerendered Nuxt state (`__NUXT_DATA__`).
 *
 * The payload is devalue's flat form: a JSON array where index 0 is the root
 * and every nested value is referenced by index. Primitive slots are shared,
 * so five sections with scrollLength 300 all point at the *same* slot. Editing
 * that slot in place would silently move five sections at once.
 *
 * So writes append a fresh slot and repoint the owning property at it. Old
 * slots may become orphaned; devalue simply never visits them.
 */

const RE_SCRIPT = /(<script type="application\/json" data-nuxt-data="nuxt-app"[^>]*id="__NUXT_DATA__"[^>]*>)([\s\S]*?)(<\/script>)/;

class PayloadError extends Error {}

function readScript(html) {
  const m = RE_SCRIPT.exec(html);
  if (!m) throw new PayloadError('__NUXT_DATA__ script tag not found in index.html');
  let flat;
  try {
    flat = JSON.parse(m[2]);
  } catch (err) {
    throw new PayloadError(`__NUXT_DATA__ is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(flat)) throw new PayloadError('__NUXT_DATA__ is not a flat array');
  return { match: m, flat };
}

/** Follow a devalue wrapper such as ["Reactive", 12] down to the real slot. */
function deref(flat, idx, seen = 0) {
  if (seen > 20) throw new PayloadError('devalue wrapper chain too deep');
  const v = flat[idx];
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number'
      && ['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef'].includes(v[0])) {
    return deref(flat, v[1], seen + 1);
  }
  return idx;
}

/** Locate the pinia scene store object slot. */
function findSceneStore(flat) {
  const root = deref(flat, 0);
  const rootObj = flat[root];
  if (!rootObj || typeof rootObj !== 'object' || Array.isArray(rootObj)) {
    throw new PayloadError('payload root is not an object');
  }
  if (rootObj.pinia === undefined) throw new PayloadError('payload has no pinia state');
  const pinia = flat[deref(flat, rootObj.pinia)];
  const storeKey = Object.keys(pinia).find((k) => {
    const s = flat[deref(flat, pinia[k])];
    return s && typeof s === 'object' && !Array.isArray(s) && s.scrollSections !== undefined;
  });
  if (!storeKey) throw new PayloadError('no pinia store with scrollSections found');
  return { storeIdx: deref(flat, pinia[storeKey]), storeKey };
}

function readSections(flat) {
  const { storeIdx } = findSceneStore(flat);
  const store = flat[storeIdx];
  const listIdx = deref(flat, store.scrollSections);
  const list = flat[listIdx];
  if (!Array.isArray(list)) throw new PayloadError('scrollSections is not an array');
  return list.map((ref) => {
    const secIdx = deref(flat, ref);
    const sec = flat[secIdx];
    if (!sec || typeof sec !== 'object' || sec.scrollLength === undefined) {
      throw new PayloadError('a scrollSections entry has no scrollLength');
    }
    return {
      idx: secIdx,
      id: flat[deref(flat, sec.id)],
      scrollLength: flat[deref(flat, sec.scrollLength)],
    };
  });
}

/** Read the values a config would need to reproduce the current payload. */
function read(html) {
  const { flat } = readScript(html);
  const { storeIdx } = findSceneStore(flat);
  const store = flat[storeIdx];
  return {
    sceneQuality: flat[deref(flat, store.sceneQuality)],
    soundEnabled: flat[deref(flat, store.soundEnabled)],
    sectionColor: flat[deref(flat, store.sectionColor)],
    sections: readSections(flat).map((s) => s.scrollLength),
  };
}

/**
 * Write scene settings into the payload.
 * `patch`: { sceneQuality?, soundEnabled?, sectionColor?, sections?: number[] }
 */
function write(html, patch) {
  const { match, flat } = readScript(html);
  const { storeIdx } = findSceneStore(flat);
  const store = flat[storeIdx];

  const push = (value) => { flat.push(value); return flat.length - 1; };

  for (const key of ['sceneQuality', 'soundEnabled', 'sectionColor']) {
    if (patch[key] === undefined) continue;
    if (store[key] === undefined) throw new PayloadError(`scene store has no "${key}"`);
    store[key] = push(patch[key]);
  }

  if (patch.sections !== undefined) {
    const sections = readSections(flat);
    if (!Array.isArray(patch.sections)) {
      throw new PayloadError('scene.sections must be an array');
    }
    if (patch.sections.length !== sections.length) {
      throw new PayloadError(
        `scene.sections has ${patch.sections.length} entries but the scene ` +
        `defines ${sections.length} scroll sections`);
    }
    patch.sections.forEach((len, i) => {
      if (typeof len !== 'number' || !Number.isFinite(len) || len < 0) {
        throw new PayloadError(`scene.sections[${i}] must be a non-negative number`);
      }
      flat[sections[i].idx].scrollLength = push(len);
    });
  }

  const json = JSON.stringify(flat);
  const patched = html.replace(RE_SCRIPT, () => `${match[1]}${json}${match[3]}`);

  // Read back and confirm the graph now says what the config asked for.
  const after = read(patched);
  for (const key of ['sceneQuality', 'soundEnabled', 'sectionColor']) {
    if (patch[key] !== undefined && after[key] !== patch[key]) {
      throw new PayloadError(`payload write-back check failed for "${key}"`);
    }
  }
  if (patch.sections && JSON.stringify(after.sections) !== JSON.stringify(patch.sections)) {
    throw new PayloadError('payload write-back check failed for scroll sections');
  }
  return patched;
}

module.exports = { read, write, PayloadError };
