const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Technique = sequelize.define('Technique', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:       { type: DataTypes.STRING(100), allowNull: false },
  pos:        { type: DataTypes.STRING(50) },
  category:   { type: DataTypes.STRING(50), defaultValue: '' },
  tags:       { type: DataTypes.TEXT },
  links:      { type: DataTypes.TEXT },
  note:       { type: DataTypes.TEXT },
  starred:    { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'techniques' });

module.exports = Technique;
