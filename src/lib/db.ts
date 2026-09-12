import { openDB, type IDBPDatabase } from 'idb'
import type { CollectedPiece } from '@/types/music'

const DB_NAME = 'classica'
const DB_VERSION = 1
const STORE = 'pieces'

// Lazily-opened, module-level handle.
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // One row per collected spot, keyed by spotId. The `spotId` primary
        // key is what enforces "one-time collection" at the storage layer:
        // a second put() for the same spot overwrites, never duplicates.
        const store = db.createObjectStore(STORE, { keyPath: 'spotId' })
        // Index for future queries (e.g. "list by base song"), even if the
        // current UI only lists everything.
        store.createIndex('byBaseSong', 'baseSongId', { unique: false })
      },
    })
  }
  return dbPromise
}

/**
 * Persist a collected piece. Idempotent per spot: putting the same `spotId`
 * again replaces the previous row rather than adding a duplicate.
 */
export async function savePiece(piece: CollectedPiece): Promise<void> {
  const db = await getDb()
  await db.put(STORE, piece)
}

/** Fetch a single collected piece by spot id, or null. */
export async function getPiece(spotId: string): Promise<CollectedPiece | null> {
  const db = await getDb()
  const row = await db.get(STORE, spotId)
  return (row as CollectedPiece | undefined) ?? null
}

/** All collected pieces, most recently collected first. */
export async function getAllPieces(): Promise<CollectedPiece[]> {
  const db = await getDb()
  const all = (await db.getAll(STORE)) as CollectedPiece[]
  return all.sort((a, b) => (a.collectedAt < b.collectedAt ? 1 : -1))
}

/** Whether a given spot has already been collected. */
export async function isCollected(spotId: string): Promise<boolean> {
  const row = await getPiece(spotId)
  return row !== null
}

/** Remove a collected piece (used by tests / the debug panel's "reset"). */
export async function deletePiece(spotId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, spotId)
}

/** Remove every collected piece (debug-panel "clear all"). */
export async function clearAllPieces(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}
