import { create } from "zustand";
import type { HostRecord } from "@/lib/types";
import { listHosts, saveHost, deleteHost, reorderHosts } from "@/lib/api";
import { useHomeStore } from "@/store/useHomeStore";

interface HostState {
  hosts: HostRecord[];
  loaded: boolean;

  load: () => Promise<void>;
  save: (host: HostRecord) => Promise<HostRecord>;
  remove: (id: string) => Promise<void>;
  /** Optimistic local order only (during drag). */
  applyOrder: (ids: string[]) => void;
  /** Persist current `hosts` order to the backend. */
  persistOrder: () => Promise<void>;
}

export const useHostStore = create<HostState>((set, get) => ({
  hosts: [],
  loaded: false,

  load: async () => {
    const hosts = await listHosts();
    set({ hosts, loaded: true });
  },

  save: async (host) => {
    const stored = await saveHost(host);
    const hosts = get().hosts;
    const idx = hosts.findIndex((h) => h.id === stored.id);
    if (idx >= 0) {
      set({ hosts: hosts.map((h) => (h.id === stored.id ? stored : h)) });
    } else {
      set({ hosts: [...hosts, stored] });
    }
    return stored;
  },

  remove: async (id) => {
    await deleteHost(id);
    set({ hosts: get().hosts.filter((h) => h.id !== id) });
    const selected = useHomeStore.getState().selectedHost;
    if (selected?.id === id) {
      useHomeStore.getState().selectHost(null);
    }
  },

  applyOrder: (ids) => {
    const byId = new Map(get().hosts.map((h) => [h.id, h]));
    const next = ids
      .map((id) => byId.get(id))
      .filter((h): h is HostRecord => Boolean(h));
    for (const h of get().hosts) {
      if (!ids.includes(h.id)) next.push(h);
    }
    const same =
      next.length === get().hosts.length &&
      next.every((h, i) => h.id === get().hosts[i]?.id);
    if (!same) set({ hosts: next });
  },

  persistOrder: async () => {
    await reorderHosts(get().hosts.map((h) => h.id));
  },
}));
