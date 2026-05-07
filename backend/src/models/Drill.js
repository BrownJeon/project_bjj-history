const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Drill = sequelize.define('Drill', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  class_id:   { type: DataTypes.INTEGER },
  date:       { type: DataTypes.DATEONLY, allowNull: false },
  date_end:   { type: DataTypes.DATEONLY },
  pos:        { type: DataTypes.STRING(50) },
  tech:       { type: DataTypes.STRING(100), allowNull: false },
  detail:     { type: DataTypes.STRING(200) },
  stars:      { type: DataTypes.TINYINT, defaultValue: 0 },
  links:      { type: DataTypes.TEXT },
  note:       { type: DataTypes.TEXT },
  chain_ids:  { type: DataTypes.TEXT, defaultValue: '[]' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'drills' });

module.exports = Drill;
