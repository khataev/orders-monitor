const yaml = require('js-yaml');
const fs = require('fs');

let settings = function(logger, constants) {
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