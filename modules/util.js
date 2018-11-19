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

  // move to parser
  this.formatDateForOrdersQuery = function (date) {
    return date.toFormat(constants.DATE_FORMAT);
  };

  this.printDuration = function(attempt, start, end, custom_text) {
    request_duration = end.diff(start, ['seconds', 'milliseconds']);
    logger.log(`request ${custom_text} attempt ${attempt} duration: ${request_duration.toFormat('s.SS')}`);
  };

  this.log_request_error = function (response, error) {
    // Print the error if one occurred
    logger.log(`error: ${error}`);
    // Print the response status code if a response was received
    logger.log(`statusCode: ${response && response.statusCode}`);
  }

};

module.exports = new util();