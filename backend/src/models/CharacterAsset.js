const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CharacterAsset = sequelize.define('CharacterAsset', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  base_id: { type: DataTypes.INTEGER, allowNull: false },
  asset_key: { type: DataTypes.STRING(255), allowNull: false },
  binding_kind: { type: DataTypes.STRING(8), allowNull: false },
  skin_id: { type: DataTypes.INTEGER, allowNull: true },
  actor_a_skin_id: { type: DataTypes.INTEGER, allowNull: true },
  actor_b_skin_id: { type: DataTypes.INTEGER, allowNull: true },
  kind: { type: DataTypes.STRING(32), allowNull: false },
  mime_type: { type: DataTypes.STRING(64), allowNull: false },
  byte_length: { type: DataTypes.INTEGER, allowNull: false },
  sha256: { type: DataTypes.CHAR(64), allowNull: false },
  payload: { type: DataTypes.BLOB('long'), allowNull: false },
  source_path: { type: DataTypes.STRING(255), allowNull: false },
  context: { type: DataTypes.TEXT, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'character_assets',
  defaultScope: { attributes: { exclude: ['payload'] } },
  indexes: [{ unique: true, fields: ['base_id', 'asset_key'] }],
});

// Explicit unscoped reads are required for restoration. Even then JSON omits bytes.
CharacterAsset.prototype.toJSON = function toJSON() {
  const result = { ...this.get({ plain: true }) };
  delete result.payload;
  return result;
};
module.exports = CharacterAsset;
