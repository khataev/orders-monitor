const { DateTime } = require('luxon');
const constants = require('./constants');
// TODO: pass as a dependency
const logger = require('./logger');

let util = function() {

  this.sleep = async function (ms) {
    return new Promise(resolve => {
      logger.log(`sleep for ${ms} ms`);
      setTimeout(resolve, ms);
    });
  };

  this.asyncForEach = async function (array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(index, array[index])
    }
  };

  this.isToday = function (date) {
    let today = DateTime.local();
    // TODO: why .startOf('day') does not work?

    return date &&
      today.year == date.year &&
      today.month == date.month &&
      today.day == date.day;
  };

  this.sanitizeText = function (text) {
    return text
      .replace(/[\n\r]+/g, '')
      .replace(/\s{2,10}/g, ' ');
  };

  this.formatDate = function (date) {
    return date.toFormat(constants.DATE_FORMAT);
  }

};

module.exports = new util();