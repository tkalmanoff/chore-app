// ============================================================
// src/api.js — Connection to Google Sheets via Apps Script
// ============================================================
// REPLACE THIS URL with your deployed Apps Script web app URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyf1JJo1s_v_GqK7inyxurnt9EVgw5b4uRjGAjqBaBNhebYMWWfqFPE4ZX_1hMYmIc/exec';

// ─── GET helper ─────────────────────────────────────────────
async function apiGet(params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── POST helper ────────────────────────────────────────────
// Note: Apps Script requires no-cors workaround — we send as text
// and let Apps Script parse JSON from postData.contents
async function apiPost(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Load all data at once (called on app startup) ──────────
export async function loadAllData() {
  const result = await apiGet({ action: 'getAll' });
  if (!result.success) throw new Error(result.error);

  const d = result.data;

  // Parse boolean strings back from Sheets ("TRUE"/"FALSE" → true/false)
  const parseBool = (v) => v === true || v === 'TRUE' || v === 'true';
  const parseNum = (v) => parseFloat(v) || 0;

  const residents = d.residents.map(r => ({ id: r.id, n: r.n }));
  residents.sort((a, b) => a.n.localeCompare(b.n));

  const fixedWorkshifts = d.fixedWorkshifts.map(w => ({
    id: w.id, nm: w.nm, h: parseNum(w.h), to: w.to, cat: 'fixed'
  }));

  const dayWorkshifts = d.dayWorkshifts.map(w => ({
    id: w.id, nm: w.nm, day: w.day, h: parseNum(w.h),
    ess: parseBool(w.ess), imp: parseBool(w.imp), slot: w.slot || ''
  }));

  const rotWorkshifts = d.rotWorkshifts.map(w => ({
    id: w.id, nm: w.nm, h: parseNum(w.h), cat: 'rot',
    ess: parseBool(w.ess), imp: parseBool(w.imp)
  }));

  const biweeklyWorkshifts = d.biweeklyWorkshifts.map(w => ({
    id: w.id, nm: w.nm, h: parseNum(w.h), cat: 'bw', wk: w.wk,
    ess: parseBool(w.ess), imp: parseBool(w.imp)
  }));

  const nthWorkshifts = d.nthWorkshifts.map(w => ({
    id: w.id, nm: w.nm, h: parseNum(w.h), cat: 'nth',
    ess: parseBool(w.ess), imp: parseBool(w.imp)
  }));

  // Parse preferences — stored as JSON strings in Sheets
  const subs = {};
  d.preferences.forEach(p => {
    if (!p.resId) return;
    let daysOut = [];
    let prefs = {};
    try { daysOut = JSON.parse(p.daysOut || '[]'); } catch (e) { daysOut = []; }
    try { prefs = JSON.parse(p.prefs || '{}'); } catch (e) { prefs = {}; }
    subs[p.resId] = {
      resId: p.resId,
      daysOut,
      prefs,
      cookPmOk: parseBool(p.cookPmOk),
      comment: p.comment || '',
      updatedAt: p.updatedAt || ''
    };
  });

  // Parse history — assignments and submissions stored as JSON
  const history = d.history.map(h => {
    let assignments = {};
    let submissions = {};
    try { assignments = JSON.parse(h.assignmentsJSON || '{}'); } catch (e) {}
    try { submissions = JSON.parse(h.submissionsJSON || '{}'); } catch (e) {}
    return {
      weekStart: h.weekStart,
      biweek: h.biweek,
      assignments,
      submissions,
      publishedAt: h.publishedAt || ''
    };
  });

  // The most recent history entry is the published chart
  const pub = history.length > 0 ? history[history.length - 1] : null;

  return {
    residents,
    fixedWorkshifts,
    dayWorkshifts,
    rotWorkshifts,
    biweeklyWorkshifts,
    nthWorkshifts,
    subs,
    history,
    pub
  };
}

// ─── Save functions ─────────────────────────────────────────

export async function saveResidents(residents) {
  return apiPost({ action: 'saveResidents', residents });
}

export async function saveFixedWorkshifts(workshifts) {
  return apiPost({ action: 'saveFixedWorkshifts', workshifts });
}

export async function saveDayWorkshifts(workshifts) {
  return apiPost({ action: 'saveDayWorkshifts', workshifts });
}

export async function saveRotWorkshifts(workshifts) {
  return apiPost({ action: 'saveRotWorkshifts', workshifts });
}

export async function saveBiweeklyWorkshifts(workshifts) {
  return apiPost({ action: 'saveBiweeklyWorkshifts', workshifts });
}

export async function saveNthWorkshifts(workshifts) {
  return apiPost({ action: 'saveNthWorkshifts', workshifts });
}

export async function savePreference(submission) {
  return apiPost({ action: 'savePreference', submission });
}

export async function savePublish({ weekStart, biweek, assignments, submissions, publishedAt }) {
  return apiPost({
    action: 'savePublish',
    weekStart,
    biweek,
    assignments,
    submissions,
    publishedAt
  });
}

export async function initializeDefaults() {
  return apiPost({ action: 'initializeDefaults' });
}