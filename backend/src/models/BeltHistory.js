const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const BeltHistory = sequelize.define('BeltHistory', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  belt:           { type: DataTypes.STRING(10), allowNull: false },
  stripes:        { type: DataTypes.TINYINT, defaultValue: 0 },
  achieved_date:  { type: DataTypes.DATEONLY, allowNull: false },
  note:           { type: DataTypes.TEXT, defaultValue: '' },
  created_at:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:        { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'belt_history' });

module.exports = BeltHistory;
