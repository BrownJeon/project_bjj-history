const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'bjj',
  process.env.DB_USER || 'bjj_user',
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: {
      timestamps: false,
      freezeTableName: true,
    },
    timezone: '+09:00',
  }
);

async function testConnection() {
  await sequelize.authenticate();
}

module.exports = { sequelize, testConnection };
