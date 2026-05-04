const { Sequelize } = require('sequelize');
const path = require('path');
const env = require('./env');

const sequelize = env.dbUrl
  ? new Sequelize(env.dbUrl, { logging: false })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.resolve(process.cwd(), env.sqlitePath),
      logging: false,
    });

module.exports = { sequelize };

