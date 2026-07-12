const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TechniqueChain = sequelize.define('TechniqueChain', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:       { type: DataTypes.STRING(100), allowNull: false },
  note:       { type: DataTypes.TEXT },
  video_path: { type: DataTypes.STRING(500), defaultValue: null },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'technique_chains' });

module.exports = TechniqueChain;
