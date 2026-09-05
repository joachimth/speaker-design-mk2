// Design versioning (SPEC §3)
//
// Snapshots of the active design, grouped by projectKey and chained via
// parentVersion. The pure helpers (version numbering, lineage walk, key
// derivation) are testable without IndexedDB; the async functions persist
// through Dexie.

import { db } from '@/db/database';
import type { DesignState, DesignVersion } from '@/types';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Next version number = max existing + 1 (starts at 1). */
export function nextVersionNumber(existing: Pick<DesignVersion, 'version'>[]): number {
  return existing.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

/**
 * Walk the parentVersion chain from a starting version (newest first).
 * Guards against cycles and missing parents.
 */
export function versionLineage(versions: DesignVersion[], startVersion: number): DesignVersion[] {
  const byVersion = new Map(versions.map((v) => [v.version, v]));
  const chain: DesignVersion[] = [];
  const seen = new Set<number>();
  let cur = byVersion.get(startVersion);
  while (cur && !seen.has(cur.version)) {
    chain.push(cur);
    seen.add(cur.version);
    cur = cur.parentVersion != null ? byVersion.get(cur.parentVersion) : undefined;
  }
  return chain;
}

/** Versions group under the saved project id, else the project name. */
export function projectKeyFor(loadedProjectId: string | null, projectName: string): string {
  return loadedProjectId || projectName.trim() || 'unavngivet';
}

// ---------------------------------------------------------------------------
// Persistence (Dexie)
// ---------------------------------------------------------------------------

/**
 * Save a snapshot of the design. Parent defaults to the newest existing
 * version so snapshots form a chain unless an explicit parent is given.
 */
export async function snapshotDesign(
  projectKey: string,
  design: DesignState,
  note = '',
  parentVersion: number | null = null,
): Promise<DesignVersion> {
  const existing = await db.designVersions.where('projectKey').equals(projectKey).toArray();
  const version = nextVersionNumber(existing);
  const autoParent = existing.length > 0 ? Math.max(...existing.map((e) => e.version)) : null;
  const v: DesignVersion = {
    id: (globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    projectKey,
    version,
    parentVersion: parentVersion ?? autoParent,
    note,
    design: JSON.parse(JSON.stringify(design)) as DesignState,
    createdAt: Date.now(),
  };
  await db.designVersions.put(v);
  return v;
}

/** All versions for a project, newest first. */
export async function listVersions(projectKey: string): Promise<DesignVersion[]> {
  const all = await db.designVersions.where('projectKey').equals(projectKey).toArray();
  return all.sort((a, b) => b.version - a.version);
}

export async function deleteVersion(id: string): Promise<void> {
  await db.designVersions.delete(id);
}
