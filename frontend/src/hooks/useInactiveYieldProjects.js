import { useState } from "react";
import {
  INACTIVE_PROJECTS_KEY,
  readObject,
  saveObject,
} from "@/lib/yieldFarmingAccounting";

export function useInactiveYieldProjects() {
  const [inactiveProjectIds, setInactiveProjectIds] = useState(() => {
    const saved = readObject(INACTIVE_PROJECTS_KEY).ids;
    return Array.isArray(saved) ? saved.map(String) : [];
  });

  const deactivateProject = (key) =>
    setInactiveProjectIds((current) => {
      const id = String(key);
      const next = current.includes(id) ? current : [...current, id];
      saveObject(INACTIVE_PROJECTS_KEY, { ids: next });
      return next;
    });

  const reactivateProject = (key) =>
    setInactiveProjectIds((current) => {
      const next = current.filter((id) => id !== String(key));
      saveObject(INACTIVE_PROJECTS_KEY, { ids: next });
      return next;
    });

  return {
    inactiveProjectIds,
    deactivateProject,
    reactivateProject,
  };
}
