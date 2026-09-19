import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AppState, Store } from './store';

const StoreContext = createContext<Store | null>(null);

export const StoreProvider = StoreContext.Provider;

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider 缺失');
  return store;
}

export function useAppState(): AppState {
  const store = useStore();
  return useSyncExternalStore(
    l => store.subscribe(l),
    () => store.getState(),
    () => store.getState(),
  );
}
