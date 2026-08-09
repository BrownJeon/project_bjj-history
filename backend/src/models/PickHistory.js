const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PickHistory = sequelize.define('PickHistory', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  clip_id:    { type: DataTypes.INTEGER, allowNull: false },
  pick_date:  { type: DataTypes.DATEONLY, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:    { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'pick_history',
  timestamps: false,
});

module.exports = PickHistory;
