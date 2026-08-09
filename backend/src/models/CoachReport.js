const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CoachReport = sequelize.define('CoachReport', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type:         { type: DataTypes.STRING(20), allowNull: false },
  period_start: { type: DataTypes.DATEONLY },
  period_end:   { type: DataTypes.DATEONLY },
  question:     { type: DataTypes.TEXT },
  content:      { type: DataTypes.TEXT, allowNull: false },
  created_at:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:      { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'coach_reports' });

module.exports = CoachReport;
