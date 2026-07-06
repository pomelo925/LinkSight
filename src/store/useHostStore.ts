import { create } from "zustand";
import type { HostRecord } from "@/lib/types";
import { listHosts, saveHost, deleteHost } from "@/lib/api";
import { useHomeStore } from "@/store/useHomeStore";

interface HostState {
  hosts: HostRecord[];
  loaded: boolean;

  load: () => Promise<void>;
  save: (host: HostRecord) => Promise<HostRecord>;
  remove: (id: string) => Promise<void>;
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
}));
