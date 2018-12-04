const { DateTime } = require('luxon');
const request = require('request');
const util = require('./util');

const Bot = require('node-telegram-bot-api');

let sent_message_log_length;

function cropSentMessage(message) {
  return `${message.substr(0, sent_message_log_length)}...`;
}

let telegram = function(settings, logger) {
  let today_token = settings.get('credentials.telegram_bot.today.api_token'),
    tomorrow_token = settings.get('credentials.telegram_bot.tomorrow.api_token'),
    bot_tomorrow = new Bot(tomorrow_token, { polling: false }),
    bot_today = new Bot(today_token, { polling: false }),
    message_prepender = settings.get('debug.message_prepender'),
    env = settings.get('env');
  sent_message_log_length = settings.get('debug.sent_message_log_length');

  bot_today.setWebHook(`https://orders-monitor.herokuapp.com/${today_token}`, {
    // certificate: `certs/${env}/server.crt`, // Path to your crt.pem
  });

  bot_tomorrow.setWebHook(`https://orders-monitor.herokuapp.com/${tomorrow_token}`, {
    // certificate: `certs/${env}/server.crt`, // Path to your crt.pem
  });

  this.mapGetUpdatesElement = function (elem) {
    console.log('mapGetUpdatesElement', elem);
    return elem['message']['chat']['id'];
  };

  this.answerCallbackQueryToday = function (query_id, chat_id, order_number) {
    let text = `chat_id: ${chat_id}, order_number: ${order_number}`;
    bot_today.answerCallbackQuery(query_id, { text: text, show_alert: true } );
  };

  this.answerCallbackQueryTomorrow = function (query_id, chat_id, order_number) {
    let text = `chat_id: ${chat_id}, order_number: ${order_number}`;
    bot_tomorrow.answerCallbackQuery(query_id, { text: text, show_alert: true } );
  };

  // HINT: do not use to get subscribers, get them from settings instead
  this.getBotSubscribers = function (date = DateTime.local()) {
    let api_token = this.getApiToken(settings, date);
    let url = `https://api.telegram.org/bot${api_token}/getUpdates`;

    let promise = new Promise(function(resolve, reject) {
      let params = { url: url };
      request.post(params, function (error, response, body) {
        if (error) {
          util.log_request_error(error, response);
          reject(error);
        }
        else {
          let body_json = JSON.parse(body);
          let result = body_json['result'];
          console.log(result);
          // TODO: how to avoid this context hoisting
          let parent = this;
          let subscribers = (result == undefined ? [] : result.map(parent.mapGetUpdatesElement));
          let uniqueSubscribers = new Set(subscribers); // make them unique
          resolve(uniqueSubscribers);
        }
      });
    });

    return promise;
  };

  this.getChatIds = function (){
    return settings.get('credentials.telegram_bot.chat_ids');
  };

  this.sendMessageToSubscriberMine = async function (settings, chat_id, text, reply_markup_object, date) {
    let sanitized_chat_id = chat_id.trim();
    if (!sanitized_chat_id) {
      logger.log('chat_id is empty');
    }

    let delay = this.getDelayBetweenRequests();
    let api_token = this.getApiToken(settings, date);
    let sanitized_text = util.sanitizeText(text);
    let encoded_text = encodeURI(sanitized_text);
    let encoded_reply_markup = encodeURI(JSON.stringify(reply_markup_object));
    // TODO parameters as hash ??
    let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}&reply_markup=${encoded_reply_markup}`;
    // let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}`;
    logger.log(`sendMessage url: ${url}`);
    logger.log(`sendMessageToSubscriber. chat_id: ${chat_id}, text: ${sanitized_text}`);
    request.post({
      url: url
    }, function(error, response, body) {
      logger.log(`sendMessageToSubscriber. SEND! chat_id: ${chat_id}, text: ${sanitized_text}`);
      if (error) {
        util.log_request_error(error, response);
      }
    });

    await util.sleep(delay);
  };

  // TODO: rollback save to history if send failed
  this.sendMessageToSubscriber = async function (settings, chat_id, text, reply_markup_object, date) {
    let sanitized_chat_id = parseInt(chat_id, 10);
    // TODO: need more sofisticated check
    if (isNaN(sanitized_chat_id)) {
      logger.log('chat_id is empty');
    }
    let sanitized_text = util.sanitizeText(`${message_prepender}${text}`.trim());
    let delay = this.getDelayBetweenRequests();
    // let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}`;
    logger.log(`sendMessageToSubscriber. chat_id: ${sanitized_chat_id}, text: ${sanitized_text}`);

    let bot = util.isToday(date) ? bot_today : bot_tomorrow;
    bot.sendMessage(sanitized_chat_id, sanitized_text, reply_markup_object).then(function () {
      // TODO: move to settings
      logger.log(
        `sendMessageToSubscriber. SEND! chat_id: ${sanitized_chat_id}, text: ${cropSentMessage(sanitized_text)}`
      );
    });

    await util.sleep(delay);
  };

  this.sendToTelegram = async function (settings, text, replyMarkup, date = DateTime.local()) {
    let chat_ids = this.getChatIds();
    if (chat_ids && chat_ids.length > 0) {
      logger.log(`sendToTelegram. destination chat_ids: ${chat_ids}`);
      // TODO: how to avoid this context hoisting?
      let parent = this;
      await util.asyncForEach(chat_ids, async function (i, chat_id) {
        await parent.sendMessageToSubscriber(settings, chat_id, text, replyMarkup, date);
      });
    }
    // TODO: use as promise example
    // else {
    //   this.getBotSubscribers(date)
    //     .then(subscribers => {
    //       if (subscribers == undefined || subscribers.length == 0) {
    //         logger.log('no subscribers, message would not be sent');
    //       }
    //       else {
    //         subscribers.forEach(function (chat_id) {
    //           logger.log(`sendToTelegram. Subscribers: ${subscribers}`);
    //           this.sendMessageToSubscriber(settings, chat_id, text, replyMarkup, date);
    //         });
    //       }
    //     });
    // }
  };

  this.getApiToken = function (settings, date = DateTime.local()) {
    return util.isToday(date) ?
      settings.get('credentials.telegram_bot.today.api_token') :
      settings.get('credentials.telegram_bot.tomorrow.api_token');
  };

  this.getDelayBetweenRequests = function (){
    return settings.get('credentials.telegram_bot.delay_between_requests');
  };
};

module.exports = telegram;









