// core/cache.js - 데이터 캐시 및 전체 로드

import { api } from './api.js';

export const CACHE = { classes: [], techniques: [], chains: [], gameplans: [], clips: [], profile: {}, belts: [] };

export async function loadAll(){
  const [classes, techniques, chains, gameplans, clips, profile, belts] = await Promise.all([
    api('GET','/api/classes'),
    api('GET','/api/techniques'),
    api('GET','/api/chains'),
    api('GET','/api/gameplans'),
    api('GET','/api/clips'),
    api('GET','/api/profile'),
    api('GET','/api/belts'),
  ]);
  CACHE.classes    = classes;
  CACHE.techniques = techniques;
  CACHE.chains     = chains;
  CACHE.gameplans  = gameplans;
  CACHE.clips      = clips    || [];
  CACHE.profile    = profile  || {};
  CACHE.belts      = belts    || [];
}
