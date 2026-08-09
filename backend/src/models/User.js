const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email:          { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password:       { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
  name:           { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
  avatar:         { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
  oauth_provider: { type: DataTypes.STRING(50),  allowNull: true, defaultValue: null },
  oauth_id:       { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
  created_at:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'users', timestamps: false });

module.exports = User;
