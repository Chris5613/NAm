import { useEffect, useState } from "react";
import { subscribe } from "@/lib/serverStore";
import {
  INACTIVE_PROJECTS_KEY,
  readObject,
  saveObject,
} from "@/lib/yieldFarmingAccounting";

const readInactiveIds = () => {
  const saved = readObject(INACTIVE_PROJECTS_KEY).ids;
  return Array.isArray(saved) ? [...new Set(saved.map(String))] : [];
};

const sameIds = (a, b) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function useInactiveYieldProjects() {
  const [inactiveProjectIds, setInactiveProjectIds] = useState(readInactiveIds);

  // When another NAm page or authenticated device changes the preference,
  // the shared server-backed store updates this view without a reload.
  useEffect(() => subscribe(key => {
    if (key !== null && key !== INACTIVE_PROJECTS_KEY) return;
    const ids = readInactiveIds();
    setInactiveProjectIds(previous => sameIds(previous, ids) ? previous : ids);
  }), []);

  const saveIds = next => {
    const ids = [...new Set(next.map(String))];
    // Keep the storage operation outside React state updaters. A state updater
    // can run more than once in Strict Mode and should have no side effects.
    saveObject(INACTIVE_PROJECTS_KEY, { ids });
    setInactiveProjectIds(previous => sameIds(previous, ids) ? previous : ids);
  };

  const deactivateProject = key => {
    const id = String(key);
    const current = readInactiveIds();
    if (!current.includes(id)) saveIds([...current, id]);
  };

  const reactivateProject = key => {
    const id = String(key);
    const current = readInactiveIds();
    if (current.includes(id)) saveIds(current.filter(value => value !== id));
  };

  return {
    inactiveProjectIds,
    deactivateProject,
    reactivateProject,
  };
}
