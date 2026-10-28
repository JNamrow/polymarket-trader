import { createContext, useContext } from 'react';

/** openLaunch({ mode: 'paper' | 'live', pilot: { address, name, profileImage } }) opens the portfolio wizard. */
export const LaunchContext = createContext({ openLaunch: () => {} });

export const useLaunch = () => useContext(LaunchContext);
