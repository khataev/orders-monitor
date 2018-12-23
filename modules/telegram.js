const request = require('request');
const util = require('./util');

const Bot = require('node-telegram-bot-api');

let bot_tomorrow, bot_today, sent_message_log_length;

function cropSentMessage(message) {
  return `${message.substr(0, sent_message_log_length)}...`;
}

function answerCallbackQueryToday(query_id, text) {
  bot_today.answerCallbackQuery(query_id, { text: text, show_alert: true } );
};

function answerCallbackQueryTomorrow(query_id, text) {
  bot_tomorrow.answerCallbackQuery(query_id, { text: text, show_alert: true } );
};

let telegram = function(settings, logger) {
  let today_token = settings.get('credentials.telegram_bot.today.api_token'),
    tomorrow_token = settings.get('credentials.telegram_bot.tomorrow.api_token'),
    message_prepender = settings.get('debug.message_prepender'),
    application_name = settings.get('application_name'),
    is_production_env = settings.get('env') === 'production';
  // TODO: helper for production env

  bot_tomorrow = new Bot(tomorrow_token, { polling: false });
  bot_tomorrow.id = 'bot_tomorrow';
  bot_today = new Bot(today_token, { polling: false });
  bot_today.id = 'bot_today';
  sent_message_log_length = settings.get('debug.sent_message_log_length');

  if (application_name && is_production_env) {
    bot_today.setWebHook(`https://${application_name}.herokuapp.com/${today_token}`, {
      // certificate: `certs/${env}/server.crt`, // Path to your crt.pem
    });

    bot_tomorrow.setWebHook(`https://${application_name}.herokuapp.com/${tomorrow_token}`, {
      // certificate: `certs/${env}/server.crt`, // Path to your crt.pem
    });
    logger.log('telegram webhooks initialization passed');
  }
  else {
    logger.log('Параметр application_name не установлен');
  }

  this.mapGetUpdatesElement = function (elem) {
    console.log('mapGetUpdatesElement', elem);
    return elem['message']['chat']['id'];
  };

  this.answerCallbackQuery = function(query_id, text, bot = 'today') {
    if (bot === 'today') {
      answerCallbackQueryToday(query_id, text);
    }
    else {
      answerCallbackQueryTomorrow(query_id, text);
    }
  };

  // HINT: do not use to get subscribers, get them from settings instead
  this.getBotSubscribers = function (date = util.getNowDate()) {
    let api_token = this.getApiToken(settings, date);
    let url = `https://api.telegram.org/bot${api_token}/getUpdates`;

    return new Promise(function(resolve, reject) {
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
          let subscribers = (result === undefined ? [] : result.map(parent.mapGetUpdatesElement));
          let uniqueSubscribers = new Set(subscribers); // make them unique
          resolve(uniqueSubscribers);
        }
      });
    });
  };

  this.getChatIds = function (){
    return settings.get('credentials.telegram_bot.chat_ids');
  };

  // TODO: rollback save to history if send failed
  // TODO: no more need of settings
  this.sendMessageToSubscriber = function (settings, chat_id, text, reply_markup_options, date) {
    let sanitized_chat_id = parseInt(chat_id, 10);
    // TODO: need more sofisticated check
    if (isNaN(sanitized_chat_id)) {
      logger.log('chat_id is empty');
    }
    let sanitized_text = util.sanitizeText(`${message_prepender}${text}`.trim());
    // let delay = this.getDelayBetweenRequests();
    // let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}`;
    logger.log(`sendMessageToSubscriber. chat_id: ${sanitized_chat_id}, text: ${sanitized_text}`);

    let bot = util.isToday(date) ? bot_today : bot_tomorrow;
    return bot
      .sendMessage(sanitized_chat_id, sanitized_text, reply_markup_options)
      .then(message => {
        logger.log(
          `sendMessageToSubscriber. SEND! chat_id: ${sanitized_chat_id}, text: ${cropSentMessage(sanitized_text)}`
        );
        return message;
        // logger.log(message);
    });
  };

  this.editSubscriberMessageForBot = function (chat_id, message_id, reply_markup, bot) {
    let sanitized_chat_id = parseInt(chat_id, 10);
    if (isNaN(sanitized_chat_id)) {
      logger.log('chat_id is empty');
    }

    let options = {
      chat_id: chat_id,
      message_id: message_id
    };
    logger.log(`editSubscriberMessageForBot. bot_id: ${bot.id}, chat_id: ${sanitized_chat_id}, message_id: ${message_id}`);
    return bot.editMessageReplyMarkup(reply_markup, options);
  };

  this.editSubscriberMessage = function (chat_id, message_id, reply_markup_options, date) {
    const bot = util.isToday(date) ? bot_today : bot_tomorrow;

    return this.editSubscriberMessageForBot(chat_id, message_id, reply_markup_options, bot);
  };

  this.sendToTelegram = async function (settings, text, reply_markup_options, date = util.getNowDate()) {
    let chat_ids = this.getChatIds();
    let message_ids = [];
    if (chat_ids && chat_ids.length > 0) {
      logger.log(`sendToTelegram. destination chat_ids: ${chat_ids}`);
      // TODO: how to avoid this context hoisting?
      let parent = this;
      await util.asyncForEach(chat_ids, async function (i, chat_id) {
        await parent
          .sendMessageToSubscriber(settings, chat_id, text, reply_markup_options, date)
          .then(message => { message_ids.push(message.message_id) });
        await util.sleep(parent.getDelayBetweenRequests());
      });
    }
    return message_ids;
  };

  // TODO: rename 'Telegram' functions
  this.editMessagesInTelegramForBot = async function (message_ids, reply_markup, bot) {
    const chat_ids = this.getChatIds();
    if (chat_ids && chat_ids.length > 0) {
      logger.log(`editMessagesInTelegramForBot. destination chat_ids: ${chat_ids}`);
      let parent = this;
      await util.asyncForEach(chat_ids, async (i, chat_id) => {
        await util.asyncForEach(message_ids, async (i, message_id) => {
          await parent
            .editSubscriberMessageForBot(chat_id, message_id, reply_markup, bot)
            .catch(error =>
              logger.log(`editMessagesInTelegramForBot. chat_id: ${chat_ids}, message_id: ${message_id}, ERROR: ${error.message}`)
            );
            // .then(message => { message_ids.push(message.message_id) });
          await util.sleep(parent.getDelayBetweenRequests());
        });
      });
    }
  };

  this.editMessagesInTelegram = async function (message_ids, reply_markup, date = util.getNowDate()) {
    const bot = util.isToday(date) ? bot_today : bot_tomorrow;

    this.editMessagesInTelegramForBot(message_ids, reply_markup, bot);
  };

  this.restoreSeizedMessages = async function(orders) {
    const parent = this;
    await util.asyncForEach(orders, async (i, order) => {
      let bot = util.wasOrderSentToTodayBot(order) ? bot_today : bot_tomorrow;
      await parent.editMessagesInTelegramForBot(
        order.message_ids,
        parent.getReplyMarkup(order.orderNumber),
        bot
      );
    });
  };

  this.getApiToken = function (settings, date = util.getNowDate()) {
    return util.isToday(date) ?
      settings.get('credentials.telegram_bot.today.api_token') :
      settings.get('credentials.telegram_bot.tomorrow.api_token');
  };

  this.getDelayBetweenRequests = function (){
    return settings.get('credentials.telegram_bot.delay_between_requests');
  };

  this.getReplyMarkupBotApiOptions = function (orderNumber) {
    return {
      "reply_markup": this.getReplyMarkup(orderNumber)
    };
  };

  this.getEmptyReplyMarkupBotOptions = function () {
    return {};
  };

  this.getReplyMarkup = function (orderNumber) {
    return {
        "inline_keyboard": [
          [{ "text": 'Забрать заказ', "callback_data": `seizeOrder_${orderNumber}` }]
        ]
      };
  };

  this.getTodayBot = function() {
    return bot_today;
  }

  this.getTomorrowBot = function() {
    return bot_tomorrow;
  }
};

module.exports = telegram;









