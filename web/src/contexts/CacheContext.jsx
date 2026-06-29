import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as classesApi from '../api/classes';
import * as techniquesApi from '../api/techniques';
import * as clipsApi from '../api/clips';
import * as chainsApi from '../api/chains';
import * as gameplansApi from '../api/gameplans';
import * as settingsApi from '../api/settings';

const CacheContext = createContext(null);

export function CacheProvider({ children }) {
  const [classes, setClasses] = useState([]);
  const [techniques, setTechniques] = useState([]);
  const [clips, setClips] = useState([]);
  const [chains, setChains] = useState([]);
  const [gameplans, setGameplans] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [igCookieConfigured, setIgCookieConfigured] = useState(false);

  const reloadIgCookie = useCallback(async () => {
    const s = await settingsApi.getInstagramCookieStatus().catch(() => ({ configured: false }));
    setIgCookieConfigured(!!s.configured);
  }, []);

  const loadAll = useCallback(async () => {
    const [cl, te, cp, ch, gp] = await Promise.all([
      classesApi.listClasses().catch(() => []),
      techniquesApi.listTechniques().catch(() => []),
      clipsApi.listClips().catch(() => []),
      chainsApi.listChains().catch(() => []),
      gameplansApi.listGameplans().catch(() => []),
    ]);
    setClasses(cl); setTechniques(te); setClips(cp); setChains(ch); setGameplans(gp);
    setLoaded(true);
    reloadIgCookie();
  }, [reloadIgCookie]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reloadClips      = useCallback(async () => setClips(await clipsApi.listClips()), []);
  const reloadTechniques = useCallback(async () => setTechniques(await techniquesApi.listTechniques()), []);
  const reloadClasses    = useCallback(async () => setClasses(await classesApi.listClasses()), []);
  const reloadChains     = useCallback(async () => setChains(await chainsApi.listChains()), []);
  const reloadGameplans  = useCallback(async () => setGameplans(await gameplansApi.listGameplans()), []);

  return (
    <CacheContext.Provider value={{
      classes, techniques, clips, chains, gameplans, loaded,
      igCookieConfigured, reloadIgCookie,
      loadAll, reloadClips, reloadTechniques, reloadClasses, reloadChains, reloadGameplans,
    }}>
      {children}
    </CacheContext.Provider>
  );
}

export function useCache() {
  const ctx = useContext(CacheContext);
  if (!ctx) throw new Error('useCache must be inside CacheProvider');
  return ctx;
}
