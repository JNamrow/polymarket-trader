import { createContext, useContext } from 'react';

/** open(address, { name, profileImage, verified }) shows the trader profile drawer from anywhere. */
export const TraderDrawerContext = createContext({ open: () => {}, close: () => {}, current: null });

export const useTraderDrawer = () => useContext(TraderDrawerContext);
