const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// task-055: production schema is created only by the explicit task tool.
module.exports = sequelize.define('CharacterBase', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  base_key: { type: DataTypes.STRING(80), allowNull: false },
  label: { type: DataTypes.STRING(120), allowNull: false },
  body_spec: { type: DataTypes.TEXT, allowNull: false },
  stage: { type: DataTypes.STRING(32), allowNull: false },
  model_path: { type: DataTypes.TEXT, allowNull: true },
  rig_path: { type: DataTypes.TEXT, allowNull: true },
  approval: { type: DataTypes.TEXT, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false },
}, { tableName: 'character_bases', indexes: [{ unique: true, fields: ['base_key'] }] });
