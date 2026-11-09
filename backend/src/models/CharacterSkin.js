const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

module.exports = sequelize.define('CharacterSkin', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  base_id: { type: DataTypes.INTEGER, allowNull: false },
  skin_key: { type: DataTypes.STRING(80), allowNull: false },
  version_no: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  label: { type: DataTypes.STRING(120), allowNull: false },
  appearance: { type: DataTypes.TEXT, allowNull: false },
  approval: { type: DataTypes.TEXT, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'character_skins',
  indexes: [
    { unique: true, fields: ['base_id', 'skin_key', 'version_no'] },
    { unique: true, fields: ['base_id', 'id'] },
  ],
});
