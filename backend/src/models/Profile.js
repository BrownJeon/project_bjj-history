const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Profile = sequelize.define('Profile', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nickname:     { type: DataTypes.STRING(100), defaultValue: '' },
  start_date:   { type: DataTypes.DATEONLY },
  weight_class: { type: DataTypes.STRING(20), defaultValue: '' },
  network:      { type: DataTypes.STRING(100), defaultValue: '' },   // 레거시 단일 소속 (하위호환용 유지)
  networks:     { type: DataTypes.TEXT },                            // 소속 다중 등록 (JSON 배열 문자열)
  avatar:       { type: DataTypes.STRING(255) },
  user_id:      { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'profile' });

module.exports = Profile;
