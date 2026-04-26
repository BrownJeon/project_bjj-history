// main.js - import + window.* 바인딩 + init

// ── core ──
import { api, setLoading } from './core/api.js';
import { CACHE, loadAll } from './core/cache.js';

// ── utils ──
import {
  autoFillEnd, weekLabel, toast, today, todayPlusDays,
  setDisabled, parseMaybeJson, normLink, linkDisplay, filterPeriod,
  toggleExpandText
} from './utils/utils.js';
// ── pages ──
import { showPage, toggleMyInfo, toggleSection, closeModal, toggleHistoryAnalysis } from './pages/navigation.js';

import {
  renderRefFilters, setRefFilter, renderRef,
  openAddTypeSheet, openTechModal, addTechTag, removeTechTag,
  onTechPosChange, onTechCategoryChange,
  toggleTechFormStar, saveTechnique,
  openTechDetail, tdToggleStar, tdEdit, tdDelete,
  toggleStar, deleteTechnique, highlightTech,
  setRefSearch, setRefPage
} from './pages/techniques.js';

import {
  renderChainCard, openChainModal, addChainStep, removeChainStep,
  moveChainStep, renderChainFormSteps, saveChain, deleteChain,
  openChainDetail, cdEdit, cdDelete,
  chainFormSteps
} from './pages/chains.js';

import {
  openEditClass, addEditClassChip, removeEditClassChip,
  renderEditClassChips, renderEditClassChainChips, populateChainSelect,
  filterTechSuggestions, selectTechSuggestion, addNewTechFromClass, onTechInputKey,
  addEditClassChain, removeEditClassChain,
  updateClass, deleteClass,
  openNewClass, saveNewClass,
  initClassModalEvents, editClassSessions,
  openSparModal, addSparSession, removeSparSession, updateSparTapRatio,
  addSparSessionChip, removeSparSessionChip,
  addSparAttempt, toggleSparAttemptSuccess, removeSparAttempt,
  editSparAttempt, editSparWeak,
  addSparPosition, removeSparPosition, editSparPosition, setSparPositionScore,
  saveSpar, deleteSparDay,
  openMemoAi, retryMemoAi, applyMemoAi, closeMemoAi, toggleMemoAiText,
  findMemoVideos, addVideoLink
} from './pages/class-modal.js';

import {
  calPrevMonth, calNextMonth, openMonthPicker, closeMonthPicker,
  pickerPrevYear, pickerNextYear, selectPickerMonth,
  renderCalendar, selectCalDate, openCalSheet, closeCalSheet,
  calAddClass, toggleTrainedDate,
  renderCalDetail, renderHistory,
  openHistorySection, closeHistoryListModal
} from './pages/calendar.js';

import { renderAnalysis, setTechView, openAnalysisSection, closeAnalysisModal } from './pages/analysis.js';

import {
  toggleResearchStarFilter, renderResearch, renderGpCard,
  openGpModal, addGpNode, removeGpNode, renderGpFormNodes,
  filterGpNodeSuggestions, selectGpNodeTech, clearGpNodeTech,
  addNewTechFromGpNode, onGpNodeInputKey, onGpPosChange, onRecPosChange,
  addGpEdge, removeGpEdge, renderGpFormEdges,
  saveGameplan, deleteGameplan,
  openGpDetail, gpdUpdateStarBtn, toggleGpStar, gpdToggleStar, gpdEdit, gpdDelete,
  gpFormNodes, gpFormEdges,
  openRecommendModal, showRecommendStep, runRecommend, applyRecommendation,
  requestInlineRecommend, closeInlineRec, addSuggestedNode, addSuggestedEdge,
  filterRecStartTech, selectRecStartTech, clearRecStartTech,
  addRecTag, removeRecTag,
  setResearchSearch, setResearchPage
} from './pages/gameplan.js';

import {
  renderMyInfo, openProfileModal, saveProfile,
  selectBelt, setBeltStripes, openBeltModal, saveBelt, deleteBelt,
  onProfAvatarChange, deleteProfileAvatar
} from './pages/profile.js';

import {
  renderCoach, setCoachTab, onCoachPeriodChange,
  generateCoachReport, deleteCoachReport,
  generateCoachPlan, toggleCoachFocusDone,
  askCoachChat
} from './pages/coach.js';

import {
  renderClips, renderClipFilters, setClipFilter, setClipTechFilter, setClipSearch,
  openClipModal, saveClip, deleteClip, openClipDetail, toggleClipStar,
  addClipTag, removeClipTag, onClipUrlInput, clipTechSearch, selectClipTech, clearClipTech,
  clipCdEdit, clipCdDelete,
  analyzeClipVideo,
  clipCurrentId, setClipsPage
} from './pages/clips.js';

// ── window.* 바인딩 (inline onclick 호환) ──
Object.assign(window, {
  // core
  CACHE, api, loadAll, setLoading,
  // utils
  autoFillEnd, weekLabel, toast, today, todayPlusDays, setDisabled,
  parseMaybeJson, normLink, linkDisplay, toggleExpandText,
  // navigation
  showPage, toggleMyInfo, toggleSection, closeModal, toggleHistoryAnalysis,
  // techniques
  renderRefFilters, setRefFilter, renderRef, setRefSearch, setRefPage,
  openAddTypeSheet, openTechModal, addTechTag, removeTechTag,
  onTechPosChange, onTechCategoryChange,
  toggleTechFormStar, saveTechnique,
  openTechDetail, tdToggleStar, tdEdit, tdDelete,
  toggleStar, deleteTechnique, highlightTech,
  // chains
  renderChainCard, openChainModal, addChainStep, removeChainStep,
  moveChainStep, renderChainFormSteps, saveChain, deleteChain,
  openChainDetail, cdEdit, cdDelete,
  // class-modal
  openEditClass, addEditClassChip, removeEditClassChip,
  renderEditClassChips, renderEditClassChainChips, populateChainSelect,
  filterTechSuggestions, selectTechSuggestion, addNewTechFromClass, onTechInputKey,
  addEditClassChain, removeEditClassChain,
  updateClass, deleteClass,
  openSparModal, addSparSession, removeSparSession, updateSparTapRatio,
  addSparSessionChip, removeSparSessionChip,
  addSparAttempt, toggleSparAttemptSuccess, removeSparAttempt,
  editSparAttempt, editSparWeak,
  addSparPosition, removeSparPosition, editSparPosition, setSparPositionScore,
  saveSpar, deleteSparDay,
  openMemoAi, retryMemoAi, applyMemoAi, closeMemoAi, toggleMemoAiText,
  findMemoVideos, addVideoLink,
  // calendar
  calPrevMonth, calNextMonth, openMonthPicker, closeMonthPicker,
  pickerPrevYear, pickerNextYear, selectPickerMonth,
  renderCalendar, selectCalDate, openCalSheet, closeCalSheet,
  calAddClass, openNewClass, saveNewClass, toggleTrainedDate,
  renderCalDetail, renderHistory,
  openHistorySection, closeHistoryListModal,
  // analysis
  renderAnalysis, setTechView, openAnalysisSection, closeAnalysisModal,
  // gameplan
  toggleResearchStarFilter, renderResearch, renderGpCard,
  openGpModal, addGpNode, removeGpNode, renderGpFormNodes,
  filterGpNodeSuggestions, selectGpNodeTech, clearGpNodeTech,
  addNewTechFromGpNode, onGpNodeInputKey, onGpPosChange, onRecPosChange,
  addGpEdge, removeGpEdge, renderGpFormEdges,
  saveGameplan, deleteGameplan,
  openGpDetail, gpdUpdateStarBtn, toggleGpStar, gpdToggleStar, gpdEdit, gpdDelete,
  openRecommendModal, showRecommendStep, runRecommend, applyRecommendation,
  requestInlineRecommend, closeInlineRec, addSuggestedNode, addSuggestedEdge,
  filterRecStartTech, selectRecStartTech, clearRecStartTech,
  addRecTag, removeRecTag,
  setResearchSearch, setResearchPage,
  // profile
  renderMyInfo, openProfileModal, saveProfile,
  selectBelt, setBeltStripes, openBeltModal, saveBelt, deleteBelt,
  onProfAvatarChange, deleteProfileAvatar,
  // clips
  renderClips, renderClipFilters, setClipFilter, setClipTechFilter, setClipSearch, setClipsPage,
  openClipModal, saveClip, deleteClip, openClipDetail, toggleClipStar,
  addClipTag, removeClipTag, onClipUrlInput, clipTechSearch, selectClipTech, clearClipTech,
  clipCdEdit, clipCdDelete,
  analyzeClipVideo,
  // coach
  renderCoach, setCoachTab, onCoachPeriodChange,
  generateCoachReport, deleteCoachReport,
  generateCoachPlan, toggleCoachFocusDone,
  askCoachChat,
});

// Make mutable arrays accessible from inline handlers
Object.defineProperty(window, 'chainFormSteps',  { get(){ return chainFormSteps;  }, set(){ /* noop */ } });
Object.defineProperty(window, 'editClassSessions',{ get(){ return editClassSessions;}, set(){ /* noop */ } });
Object.defineProperty(window, 'sparSessions',      { get(){ return editClassSessions;}, set(){ /* noop */ } });
Object.defineProperty(window, 'gpFormNodes',      { get(){ return gpFormNodes;      }, set(){ /* noop */ } });
Object.defineProperty(window, 'gpFormEdges',      { get(){ return gpFormEdges;      }, set(){ /* noop */ } });
Object.defineProperty(window, 'clipCurrentId',    { get(){ return clipCurrentId;    }, set(){ /* noop */ } });

// ── 앱 시작 ──
function updateNavClearance(){
  const nav = document.querySelector('.nav'); if(!nav) return;
  const h = nav.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--nav-clearance', (h + 8) + 'px');
}
window.addEventListener('resize', updateNavClearance);
document.addEventListener('DOMContentLoaded', updateNavClearance);
if(document.readyState !== 'loading') updateNavClearance();
window.updateNavClearance = updateNavClearance;

// 모달 오버레이 클릭 닫기 + date picker + stars 이벤트
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if(e.target === overlay) overlay.classList.remove('show'); });
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('input[type="date"]');
    if(!el || el.disabled || el.readOnly) return;
    try { el.showPicker(); } catch(_) {}
  });
  initClassModalEvents();
});

setLoading(true);
loadAll().then(()=>{
  renderHistory();
  renderClipFilters();
  renderClips();
  setLoading(false);
}).catch(()=> setLoading(false));
