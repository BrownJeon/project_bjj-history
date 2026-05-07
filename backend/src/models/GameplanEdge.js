const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const GameplanEdge = sequelize.define('GameplanEdge', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  gameplan_id:  { type: DataTypes.INTEGER, allowNull: false },
  from_node_id: { type: DataTypes.INTEGER, allowNull: false },
  to_node_id:   { type: DataTypes.INTEGER, allowNull: false },
  condition:    { type: DataTypes.STRING(300), defaultValue: '' },
}, { tableName: 'gameplan_edges' });

module.exports = GameplanEdge;
