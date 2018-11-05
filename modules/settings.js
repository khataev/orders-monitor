const yaml = require('js-yaml');
const fs = require('fs');
const constants = require('./constants');

let settings = function(logger) {
  this.readSettings = function () {
    let settings;
    try {
      settings = yaml.safeLoad(fs.readFileSync('settings.yml', constants.FILE_ENCODING));
    } catch (e) {
      logger.log(e);
    }

    return settings;
  }
};

module.exports = settings;