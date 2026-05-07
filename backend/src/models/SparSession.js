const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SparSession = sequelize.define('SparSession', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  spar_day_id:    { type: DataTypes.INTEGER, allowNull: false },
  level:          { type: DataTypes.STRING(20) },
  opponent:       { type: DataTypes.STRING(100), defaultValue: '' },
  tap_got:        { type: DataTypes.TINYINT, defaultValue: 0 },
  tap_gave:       { type: DataTypes.TINYINT, defaultValue: 0 },
  time_min:       { type: DataTypes.TINYINT },
  position_score: { type: DataTypes.TINYINT, defaultValue: 0 },
  positions:      { type: DataTypes.TEXT, defaultValue: '[]' },
  success:        { type: DataTypes.TEXT },
  weak:           { type: DataTypes.TEXT },
  note:           { type: DataTypes.TEXT },
}, { tableName: 'spar_sessions' });

module.exports = SparSession;
