const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SparDay = sequelize.define('SparDay', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  class_id:   { type: DataTypes.INTEGER },
  date:       { type: DataTypes.DATEONLY, allowNull: false },
  date_end:   { type: DataTypes.DATEONLY },
  day_note:   { type: DataTypes.TEXT },
  links:      { type: DataTypes.TEXT, defaultValue: '[]' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'spar_days' });

module.exports = SparDay;
