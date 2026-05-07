const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Profile = sequelize.define('Profile', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nickname:     { type: DataTypes.STRING(100), defaultValue: '' },
  start_date:   { type: DataTypes.DATEONLY },
  weight_class: { type: DataTypes.STRING(20), defaultValue: '' },
  network:      { type: DataTypes.STRING(100), defaultValue: '' },
  avatar:       { type: DataTypes.STRING(255) },
}, { tableName: 'profile' });

module.exports = Profile;
