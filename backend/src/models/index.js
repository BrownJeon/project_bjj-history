const { sequelize } = require('../config/db');

const User            = require('./User');
const Class           = require('./Class');
const Drill           = require('./Drill');
const SparDay         = require('./SparDay');
const SparSession     = require('./SparSession');
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

// 관계 정의
Class.hasMany(Drill,         { foreignKey: 'class_id', as: 'drills' });
Drill.belongsTo(Class,       { foreignKey: 'class_id' });

Class.hasMany(SparDay,       { foreignKey: 'class_id', as: 'spar_days' });
SparDay.belongsTo(Class,     { foreignKey: 'class_id' });

SparDay.hasMany(SparSession, { foreignKey: 'spar_day_id', as: 'sessions' });
SparSession.belongsTo(SparDay,{ foreignKey: 'spar_day_id' });

TechniqueChain.hasMany(ChainStep, { foreignKey: 'chain_id', as: 'steps' });
ChainStep.belongsTo(TechniqueChain, { foreignKey: 'chain_id' });
ChainStep.belongsTo(Technique,    { foreignKey: 'technique_id' });

Gameplan.hasMany(GameplanNode, { foreignKey: 'gameplan_id', as: 'nodes' });
Gameplan.hasMany(GameplanEdge, { foreignKey: 'gameplan_id', as: 'edges' });
GameplanNode.belongsTo(Gameplan, { foreignKey: 'gameplan_id' });
GameplanNode.belongsTo(Technique, { foreignKey: 'technique_id' });
GameplanEdge.belongsTo(Gameplan, { foreignKey: 'gameplan_id' });

module.exports = {
  sequelize,
  User,
  Class, Drill, SparDay, SparSession,
  Technique, TechniqueChain, ChainStep,
  Gameplan, GameplanNode, GameplanEdge,
  VideoClip, Profile, BeltHistory, CoachReport,
  PickHistory, MembershipPayment,
};
