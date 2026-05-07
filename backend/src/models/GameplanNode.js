const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const GameplanNode = sequelize.define('GameplanNode', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  gameplan_id:  { type: DataTypes.INTEGER, allowNull: false },
  technique_id: { type: DataTypes.INTEGER },
  label:        { type: DataTypes.STRING(200), defaultValue: '' },
  is_finish:    { type: DataTypes.TINYINT, defaultValue: 0 },
  note:         { type: DataTypes.TEXT, defaultValue: '' },
}, { tableName: 'gameplan_nodes' });

module.exports = GameplanNode;
