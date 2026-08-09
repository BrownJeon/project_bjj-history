const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Gameplan = sequelize.define('Gameplan', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:       { type: DataTypes.STRING(200), allowNull: false },
  start_pos:  { type: DataTypes.STRING(100), defaultValue: '' },
  end_pos:    { type: DataTypes.STRING(100), defaultValue: '' },
  note:       { type: DataTypes.TEXT, defaultValue: '' },
  starred:    { type: DataTypes.TINYINT, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:    { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'gameplans' });

module.exports = Gameplan;
