const request = require('request');
const util = require('./util');

const Bot = require('node-telegram-bot-api');

let bot_tomorrow, bot_today, sent_message_log_length;

function cropSentMessage(message) {
  return `${message.substr(0, sent_message_log_length)}...`;
}

function answerCallbackQueryToday(query_id, text) {
  bot_today.answerCallbackQuery(query_id, { text: text, show_alert: true });
};

function answerCallbackQueryTomorrow(query_id, text) {
  bot_tomorrow.answerCallbackQuery(query_id, { text: text, show_alert: true });
};

let telegram = function (settings, logger, set_webhooks = false) {
  let today_token = settings.get('credentials.telegram_bot.today.api_token'),
    tomorrow_token = settings.get('credentials.telegram_bot.tomorrow.api_token'),
    message_prepender = settings.get('debug.message_prepender'),
    application_name = settings.get('application_name'),
    is_production_env = settings.isProductionEnv();

  bot_tomorrow = new Bot(tomorrow_token, { polling: false });
  bot_tomorrow.id = 'bot_tomorrow';
  bot_today = new Bot(today_token, { polling: false });
  bot_today.id = 'bot_today';
  sent_message_log_length = settings.get('debug.sent_message_log_length');

  if (application_name && is_production_env && set_webhooks) {
    // TODO: move webhooks initialization to explicit routine to be run consequently
    // before login
    const parent = this;
    logger.warn('Setting TODAY bot webhook');
    bot_today
      .setWebHook(`https://${application_name}.herokuapp.com/${today_token}`)
      .then(() => logger.warn('Setting TODAY bot webhook - DONE'))
      .then(() => {
        logger.warn('Setting TOMORROW bot webhook');
        return util.sleep(parent.getDelayBetweenRequests());
      })
      .then(() => {
        return bot_tomorrow
          .setWebHook(`https://${application_name}.herokuapp.com/${tomorrow_token}`);
      })
      .then(() => logger.warn('Setting TOMORROW bot webhook - DONE'))
      .then(() => logger.warn('Telegram webhooks initialization passed'))
      .catch(error => logger.error(error.message));
  }
  if (!application_name)
    logger.error('Параметр application_name не установлен');

  this.mapGetUpdatesElement = function (elem) {
    logger.debug('mapGetUpdatesElement', elem);
    return elem['message']['chat']['id'];
  };

  this.answerCallbackQuery = function (query_id, text, bot = 'today') {
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

    return new Promise(function (resolve, reject) {
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

  this.getChatIds = function () {
    return settings
      .get('credentials.telegram_bot.chat_ids')
      .map(chat_id => chat_id.toString().trim());
  };

  // TODO: rollback save to history if send failed
  this.sendMessageToSubscriber = function (chat_id, text, reply_markup_options, date) {
    let sanitized_chat_id = parseInt(chat_id, 10);
    if (isNaN(sanitized_chat_id)) {
      logger.error('chat_id is empty');
    }
    let sanitized_text = util.sanitizeText(`${message_prepender}${text}`.trim());
    // let delay = this.getDelayBetweenRequests();
    // let url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${encoded_text}`;
    logger.info(`sendMessageToSubscriber. chat_id: ${sanitized_chat_id}, text: ${sanitized_text}`);

    let bot = util.isToday(date) ? bot_today : bot_tomorrow;
    return bot
      .sendMessage(sanitized_chat_id, sanitized_text, reply_markup_options)
      .then(message => {
        logger.warn(
          `sendMessageToSubscriber. SEND! chat_id: ${sanitized_chat_id}, text: ${cropSentMessage(sanitized_text)}`
        );
        logger.debug(message);
        return message;
      });
  };

  this.editSubscriberMessageForBot = function (chat_id, message_id, reply_markup, bot) {
    let sanitized_chat_id = parseInt(chat_id, 10);
    if (isNaN(sanitized_chat_id)) {
      logger.error('chat_id is empty');
    }

    let options = {
      chat_id: chat_id,
      message_id: message_id
    };
    logger.warn(`editSubscriberMessageForBot. bot_id: ${bot.id}, chat_id: ${sanitized_chat_id}, message_id: ${message_id}`);
    return bot.editMessageReplyMarkup(reply_markup, options);
  };

  this.editSubscriberMessage = function (chat_id, message_id, reply_markup_options, date) {
    const bot = util.isToday(date) ? bot_today : bot_tomorrow;

    return this.editSubscriberMessageForBot(chat_id, message_id, reply_markup_options, bot);
  };

  this.sendToTelegram = async function (text, reply_markup_options, date = util.getNowDate()) {
    let chat_ids = this.getChatIds();
    let sent_messages = {};
    if (chat_ids && chat_ids.length > 0) {
      logger.warn(`sendToTelegram. destination chat_ids: ${chat_ids}`);
      // TODO: how to avoid this context hoisting?
      let parent = this;
      await util.asyncForEach(chat_ids, async function (i, chat_id) {
        await parent
          .sendMessageToSubscriber(chat_id, text, reply_markup_options, date)
          .then(message => sent_messages[chat_id] = message.message_id);
        await util.sleep(parent.getDelayBetweenRequests());
      });
    }
    return sent_messages;
  };

  // TODO: rename 'Telegram' functions
  this.editMessagesInTelegramForBot = async function (sent_messages, reply_markup, bot) {
    const chat_ids = Object.getOwnPropertyNames(sent_messages);
    if (chat_ids && chat_ids.length > 0) {
      logger.info(`editMessagesInTelegramForBot. destination chat_ids: ${chat_ids}`);
      let parent = this;
      await util.asyncForEach(chat_ids, async (i, chat_id) => {
        let message_id = sent_messages[chat_id];
        parent
          .editSubscriberMessageForBot(chat_id, message_id, reply_markup, bot)
          .catch(error => {
            logger
              .warn(
                `editMessagesInTelegramForBot. chat_id: ${chat_id}, message_id: ${message_id}, ERROR: ${error.message}`
              );
          });
        await util.sleep(parent.getDelayBetweenRequests());
      });
    }
  };

  this.editMessagesInTelegram = function (sent_messages, reply_markup, date = util.getNowDate()) {
    const bot = util.isToday(date) ? bot_today : bot_tomorrow;

    return this.editMessagesInTelegramForBot(sent_messages, reply_markup, bot);
  };

  this.restoreSeizedMessages = async function (orders) {
    const parent = this;
    await util.asyncForEach(orders, async (i, order) => {
      let bot = util.wasOrderSentToTodayBot(order) ? bot_today : bot_tomorrow;
      await parent.editMessagesInTelegramForBot(
        order.sent_messages,
        parent.getReplyMarkup(order.orderNumber, order.eid),
        bot
      );
    });
  };

  this.getApiToken = function (settings, date = util.getNowDate()) {
    return util.isToday(date) ?
      settings.get('credentials.telegram_bot.today.api_token') :
      settings.get('credentials.telegram_bot.tomorrow.api_token');
  };

  this.getDelayBetweenRequests = function () {
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

  this.getTodayBot = function () {
    return bot_today;
  };

  this.getTomorrowBot = function () {
    return bot_tomorrow;
  };
};

module.exports = telegram;









