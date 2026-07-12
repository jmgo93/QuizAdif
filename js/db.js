// IndexedDB: almacenamiento persistente e ilimitado (preguntas, intentos, sesiones, ajustes)
const DB_NAME = 'quizmaster';
const DB_VER = 1;

/** @type {IDBDatabase|null} */
let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('questions')) {
        const s = db.createObjectStore('questions', { keyPath: 'id' });
        s.createIndex('category', 'category');
        s.createIndex('dueAt', 'srs.dueAt');
      }
      if (!db.objectStoreNames.contains('attempts')) {
        const s = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
        s.createIndex('questionId', 'questionId');
        s.createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}

const tx = async (store, mode = 'readonly') => (await open()).transaction(store, mode).objectStore(store);
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const getAll  = async (store) => wrap((await tx(store)).getAll());
export const get     = async (store, key) => wrap((await tx(store)).get(key));
export const put     = async (store, val) => wrap((await tx(store, 'readwrite')).put(val));
export const del     = async (store, key) => wrap((await tx(store, 'readwrite')).delete(key));
export const clear   = async (store) => wrap((await tx(store, 'readwrite')).clear());
export const count   = async (store) => wrap((await tx(store)).count());

export async function putMany(store, items) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    items.forEach(i => s.put(i));
    t.oncomplete = () => res(items.length);
    t.onerror = () => rej(t.error);
  });
}

export const getMeta = async (k, fallback = null) => (await get('meta', k))?.v ?? fallback;
export const setMeta = (k, v) => put('meta', { k, v });

/** Solicita almacenamiento persistente (evita que el navegador borre datos). */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}

export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota };
}
