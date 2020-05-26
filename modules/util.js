const { DateTime, Settings } = require('luxon');
const constants = require('./constants');
const logger = require('./logger');

let util = function () {
  Settings.defaultZoneName = "Europe/Moscow";

  this.sleep = async function (ms) {
    return new Promise(resolve => {
      logger.info(`sleep for ${ms} ms`);
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
      // .replace(/[\n\r]+/g, '')
      .replace(/\s{2,10}/g, ' ');
  };

  // move to parser
  this.formatDateForOrdersQuery = function (date) {
    return date.toFormat(constants.DATE_FORMAT);
  };

  this.printDuration = function (attempt, start, end, custom_text) {
    request_duration = end.diff(start, ['seconds', 'milliseconds']);
    logger.warn(`request ${custom_text} attempt ${attempt} duration: ${request_duration.toFormat('s.SS')}`);
  };

  this.log_request_error = function (error, response) {
    // Print the error if one occurred
    logger.error(`error: ${error}`);
    // Print the response status code if a response was received
    logger.error(`statusCode: ${response && response.statusCode}`);
  };

  this.getNowDate = function () {
    return DateTime.local();
  };

  this.getTomorrowDate = function () {
    return DateTime.local().plus({ days: 1 });
  };

  this.wasOrderSentToTodayBot = function (order) {
    let order_today = DateTime.fromJSDate(order.createdAt);
    let order_date = DateTime.fromFormat(order.date, constants.ORDERS_HISTORY_DATE_FORMAT);

    return order_date &&
      order_date.year == order_today.year &&
      order_date.month == order_today.month &&
      order_date.day == order_today.day;
  }

  this.debugCookies = function (jar, settings, customText) {
    if (!jar) {
      logger.info('debugCookies', 'jar пуст');
      return;
    }

    let url = new URL(settings.get('orders.details_url'));
    console.log(
      'debugCookies',
      customText,
      jar.getCookies(url.origin)
    );
  }
};

module.exports = new util();