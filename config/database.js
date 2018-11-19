const config = require('./../modules/config');

module.exports = {
  development: {
    username: config.get('db.username'),
    password: config.get('db.password'),
    database: config.get('db.database'),
    host: config.get('db.host'),
    dialect: config.get('db.dialect')
  },
  production: config.get('db.url')
};
