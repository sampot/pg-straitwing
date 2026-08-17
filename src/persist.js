import { EMPTY_PROGRESS, normalizeProgress } from "./progress.js";

const KV_KEY = "progress";
const RAW_URL = "/api/kv/pg-straitwing:progress";

async function sdk() {
  const PG = globalThis.window?.PG;
  if (!PG) return null;
  try {
    await PG.ready;
  } catch {
    return null;
  }
  return PG.kv ? PG : null;
}

function parse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Progress lives in the host KV (`PG.kv`, i.e. /api/kv) — never localStorage. */
export async function loadProgress() {
  const PG = await sdk();
  if (PG) {
    try {
      return normalizeProgress(parse(await PG.kv.get(KV_KEY)));
    } catch {
      /* fall through to the raw route */
    }
  }
  try {
    const res = await fetch(RAW_URL);
    if (res.ok) return normalizeProgress(parse(await res.text()));
  } catch {
    /* offline / standalone file open */
  }
  return { ...EMPTY_PROGRESS };
}

export async function saveProgress(progress) {
  const body = JSON.stringify(normalizeProgress(progress));
  const PG = await sdk();
  if (PG) {
    try {
      await PG.kv.put(KV_KEY, body);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  }
  try {
    const res = await fetch(RAW_URL, { method: "PUT", body });
    return { ok: res.ok };
  } catch (err) {
    return { ok: false, error: err };
  }
}
