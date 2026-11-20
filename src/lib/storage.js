// Members are saved in this browser's localStorage. Swap this file for a
// database (e.g. Supabase/Firebase) later without touching the components.

const KEY = 'gym-manager.members.v1';

export function loadMembers() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMembers(members) {
  try {
    localStorage.setItem(KEY, JSON.stringify(members));
    return true;
  } catch {
    return false;
  }
}
