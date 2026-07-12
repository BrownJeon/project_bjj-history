const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ChainStep = sequelize.define('ChainStep', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  chain_id:        { type: DataTypes.INTEGER, allowNull: false },
  technique_id:    { type: DataTypes.INTEGER, allowNull: false },
  step_order:      { type: DataTypes.INTEGER, allowNull: false },
  transition_note: { type: DataTypes.TEXT },
}, { tableName: 'chain_steps' });

module.exports = ChainStep;
