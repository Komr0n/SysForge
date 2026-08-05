import { create } from 'zustand';

interface HistoryStore {
  httpHistory: any[];
  searchHistory: string[];
  addHttpRequest: (request: any) => void;
  addSearch: (query: string) => void;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  httpHistory: [],
  searchHistory: [],
  addHttpRequest: (request) =>
    set((state) => ({
      httpHistory: [request, ...state.httpHistory].slice(0, 50),
    })),
  addSearch: (query) =>
    set((state) => ({
      searchHistory: [query, ...state.searchHistory].slice(0, 20),
    })),
}));