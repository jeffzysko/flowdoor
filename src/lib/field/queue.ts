"use client";

/**
 * Fila offline do aplicador.
 *
 * O momento mais frágil do produto é um sujeito no topo de uma escada, na
 * beira de uma rodovia, com uma barra de sinal — e é justamente o momento
 * que exige duas chamadas de rede e o envio de uma foto.
 *
 * Aqui a foto e a ação são gravadas em IndexedDB ANTES de qualquer rede.
 * Se a rede cair, nada se perde: a fila drena sozinha quando o sinal volta.
 * Cada item carrega uma chave de idempotência, então reenviar não duplica.
 */

const DB_NAME = "flowdoor-field";
const DB_VERSION = 1;
const STORE = "queue";

export type QueueAction = "start" | "finish";

export interface QueueItem {
  key: string; // idempotency key
  action: QueueAction;
  eventId: string;
  orgId: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  payload: {
    lat: number | null;
    lng: number | null;
    accuracy?: number | null;
    notes?: string | null;
  };
  photo?: Blob;
  photoName?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function enqueue(item: Omit<QueueItem, "attempts" | "createdAt">) {
  await tx("readwrite", (s) =>
    s.put({ ...item, attempts: 0, createdAt: Date.now() } as QueueItem)
  );
}

export async function listQueue(): Promise<QueueItem[]> {
  const all = await tx<QueueItem[]>("readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function dequeue(key: string) {
  await tx("readwrite", (s) => s.delete(key));
}

export async function markFailure(key: string, message: string) {
  const item = await tx<QueueItem | undefined>(
    "readonly",
    (s) => s.get(key) as IDBRequest<QueueItem | undefined>
  );
  if (!item) return;
  await tx("readwrite", (s) =>
    s.put({ ...item, attempts: item.attempts + 1, lastError: message })
  );
}

export async function pendingCount(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}
