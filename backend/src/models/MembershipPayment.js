const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MembershipPayment = sequelize.define('MembershipPayment', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paid_date:    { type: DataTypes.DATEONLY, allowNull: false },
  duration:     { type: DataTypes.STRING(10), allowNull: false }, // '1개월' | '3개월'
  session_type: { type: DataTypes.STRING(10), allowNull: false }, // '주 3회' | '매일권'
  memo:         { type: DataTypes.TEXT, defaultValue: '' },
  created_at:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:      { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'membership_payments', timestamps: false });

module.exports = MembershipPayment;
