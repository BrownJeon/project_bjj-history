const { sequelize } = require('../config/db');

const User            = require('./User');
const Class           = require('./Class');
const Drill           = require('./Drill');
const SparDay         = require('./SparDay');
const SparSession     = require('./SparSession');
const SparCause       = require('./SparCause');
const Technique       = require('./Technique');
const TechniqueChain  = require('./TechniqueChain');
const ChainStep       = require('./ChainStep');
const Gameplan        = require('./Gameplan');
const GameplanNode    = require('./GameplanNode');
const GameplanEdge    = require('./GameplanEdge');
const VideoClip       = require('./VideoClip');
const Profile         = require('./Profile');
const BeltHistory     = require('./BeltHistory');
const CoachReport     = require('./CoachReport');
const PickHistory          = require('./PickHistory');
const MembershipPayment    = require('./MembershipPayment');
const LongVideo            = require('./LongVideo');
const LongVideoChapter     = require('./LongVideoChapter');
const TechniqueMastery     = require('./TechniqueMastery');
const RecallSummary        = require('./RecallSummary');
const ResearchProject      = require('./ResearchProject');
const ResearchVersion      = require('./ResearchVersion');
const ResearchNode         = require('./ResearchNode');
const ResearchLink         = require('./ResearchLink');

// User 관계 정의 (1:N, 1:1)
User.hasMany(Class,             { foreignKey: 'user_id', as: 'classes' });
User.hasMany(Technique,         { foreignKey: 'user_id', as: 'techniques' });
User.hasMany(TechniqueChain,    { foreignKey: 'user_id', as: 'chains' });
User.hasMany(Gameplan,          { foreignKey: 'user_id', as: 'gameplans' });
User.hasMany(VideoClip,         { foreignKey: 'user_id', as: 'clips' });
User.hasOne(Profile,            { foreignKey: 'user_id', as: 'profile' });
User.hasMany(BeltHistory,       { foreignKey: 'user_id', as: 'belts' });
User.hasMany(CoachReport,       { foreignKey: 'user_id', as: 'reports' });
User.hasMany(MembershipPayment, { foreignKey: 'user_id', as: 'memberships' });
User.hasMany(PickHistory,       { foreignKey: 'user_id', as: 'picks' });
User.hasMany(LongVideo,         { foreignKey: 'user_id', as: 'longVideos' });
// 실패 원인 태그는 계정별 어휘 사전이다 — 목록·수정·비활성 모두 user_id 로 격리된다 (task-022)
User.hasMany(SparCause,         { foreignKey: 'user_id', as: 'sparCauses' });
// 사다리 2·3단계 수동 체크 (task-024) — 행이 없는 것이 정상 상태다(체크 전)
User.hasMany(TechniqueMastery,  { foreignKey: 'user_id', as: 'masteries' });
// AI 복기 카드 캐시 (task-025) — 행이 없는 것이 정상 상태다(아직 요약 안 함)
User.hasMany(RecallSummary,     { foreignKey: 'user_id', as: 'recallSummaries' });
// 연구 프로젝트 (task-026) — 🔴 user_id 의 **정본은 research_projects 하나**다.
// 하위 3테이블의 user_id 는 부모에서 유도해 채우는 사본이고 권한 판정에 쓰지 않는다(계약 A-2).
User.hasMany(ResearchProject,   { foreignKey: 'user_id', as: 'researchProjects' });

// 관계 정의
Class.hasMany(Drill,         { foreignKey: 'class_id', as: 'drills' });
Drill.belongsTo(Class,       { foreignKey: 'class_id' });

Class.hasMany(SparDay,       { foreignKey: 'class_id', as: 'spar_days' });
SparDay.belongsTo(Class,     { foreignKey: 'class_id' });

SparDay.hasMany(SparSession, { foreignKey: 'spar_day_id', as: 'sessions' });
SparSession.belongsTo(SparDay,{ foreignKey: 'spar_day_id' });

// 픽미업 → 스파링 사용 피드백 (날짜 단위로 안정적인 spar_day_id를 FK로 사용)
SparDay.hasMany(PickHistory,   { foreignKey: 'spar_day_id', as: 'pickFeedbacks' });
PickHistory.belongsTo(SparDay, { foreignKey: 'spar_day_id' });

TechniqueChain.hasMany(ChainStep, { foreignKey: 'chain_id', as: 'steps' });
ChainStep.belongsTo(TechniqueChain, { foreignKey: 'chain_id' });
ChainStep.belongsTo(Technique,    { foreignKey: 'technique_id' });

Gameplan.hasMany(GameplanNode, { foreignKey: 'gameplan_id', as: 'nodes' });
Gameplan.hasMany(GameplanEdge, { foreignKey: 'gameplan_id', as: 'edges' });
GameplanNode.belongsTo(Gameplan, { foreignKey: 'gameplan_id' });
GameplanNode.belongsTo(Technique, { foreignKey: 'technique_id' });
GameplanEdge.belongsTo(Gameplan, { foreignKey: 'gameplan_id' });

LongVideo.hasMany(LongVideoChapter, { foreignKey: 'long_video_id', as: 'chapters' });
LongVideoChapter.belongsTo(LongVideo, { foreignKey: 'long_video_id' });

// 연구 트리 관계 (task-026). DB 쪽 FK 4건(CASCADE 3 + SET NULL 1)과 짝을 이룬다.
// 🔴 research_nodes.parent_node_id 의 자기참조 관계는 **일부러 정의하지 않는다.**
//    FK 도 없고 Sequelize 관계도 없다 — 자손 수집은 researchTree.collectSubtreeIds() 가
//    메모리에서 처리한다(노드 수가 작고, 깊이 상한 12 가 순회 종료를 보장한다).
//    여기에 hasMany(self) 를 추가하면 "Sequelize 가 알아서 지워 주겠지"라는 오해를 부른다 — 안 지운다.
ResearchProject.hasMany(ResearchVersion, { foreignKey: 'project_id', as: 'versions' });
ResearchVersion.belongsTo(ResearchProject, { foreignKey: 'project_id' });

ResearchVersion.hasMany(ResearchNode, { foreignKey: 'version_id', as: 'nodes' });
ResearchNode.belongsTo(ResearchVersion, { foreignKey: 'version_id' });
ResearchNode.belongsTo(Technique,     { foreignKey: 'technique_id' });

ResearchNode.hasMany(ResearchLink, { foreignKey: 'node_id', as: 'links' });
ResearchLink.belongsTo(ResearchNode, { foreignKey: 'node_id' });

module.exports = {
  sequelize,
  User,
  Class, Drill, SparDay, SparSession, SparCause,
  Technique, TechniqueChain, ChainStep, TechniqueMastery,
  RecallSummary,
  ResearchProject, ResearchVersion, ResearchNode, ResearchLink,
  Gameplan, GameplanNode, GameplanEdge,
  VideoClip, Profile, BeltHistory, CoachReport,
  PickHistory, MembershipPayment,
  LongVideo, LongVideoChapter,
};
