const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Class = sequelize.define('Class', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date:          { type: DataTypes.DATEONLY, allowNull: false },
  date_end:      { type: DataTypes.DATEONLY },
  theme:         { type: DataTypes.STRING(200), defaultValue: '' },
  note:          { type: DataTypes.TEXT,  defaultValue: '' },
  feedback:      { type: DataTypes.TEXT },
  trained_dates: { type: DataTypes.TEXT,  defaultValue: '[]' },
  created_at:    { type: DataTypes.DATE,  defaultValue: DataTypes.NOW },
}, { tableName: 'classes' });

module.exports = Class;
