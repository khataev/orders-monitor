const requestGlobal = require('request');
const express = require('express');
const bodyParser = require('body-parser');

// local files
const constants = require('./constants');
const logger = require('./logger');
const settings = require('./config');
const telegram = require('./telegram');
const util = require('./util');
const parser = require('./parser');
const history = require('./history');

const request = requestGlobal.defaults({jar: true});
const telegramApi = new telegram(settings, logger);
const historyManager = new history(settings, logger);
const parserApi = new parser(historyManager, request, settings, logger);

let test = function () {
  this.test_run = async function () {
    if (settings) {
      // ================= RESTORE SEIZED MESSAGES
      // historyManager
      //   .unmarkSeizedOrders()
      //   .then(orders => telegramApi.restoreSeizedMessages(orders))
      //   .then(() => { historyManager.closeConnections() })
      //   .catch(error => logger.log(error));

      // ================= RAW EDIT MESSAGE REPLY MARKUP
      // let bot = telegramApi.getTodayBot();
      // // let reply_markup_object = telegramApi.getEmptyReplyMarkupBotOptions();
      // let reply_markup_object = telegramApi.getReplyMarkup('50140368');
      // let options = {
      //   chat_id: 176212258,
      //   message_id: 11118
      // };
      // let message = bot
      //   .editMessageReplyMarkup(reply_markup_object, options);

      // ================= EDIT MESSAGE
      // telegramApi
      //   .editSubscriberMessageForBot(
      //     176212258,
      //     11115,
      //     telegramApi.getReplyMarkupBotApi('50138678'),
      //     telegramApi.getTodayBot()
      //   );

      // ================= SEIZE ORDERS
      let date = util.getNowDate();
      // let date = util.getNowDate().plus({ days: 1 });
      let day = util.isToday(date) ? 'TODAY' : 'TOMORROW';
      // telegramApi.sendMessageToSubscriber(
      //   settings,
      //   '176212258',
      //   'Бла бла бла',
      //   parserApi.getReplyMarkupBotApi('1234'),
      //   date
      // ).then(message => console.log(message.message_id));

      // telegramApi.editMessagesInTelegram([10880], parserApi.seizedOrderReplyMarkup(), date);

      // current order
      let order_numbers = ['50244194'];
      historyManager
        .initOrdersHistory()
        .then(orders => {
          console.log('INIT COMPLETE:');
        })
        .then(() => {
          historyManager.markSeizedOrders(order_numbers, date)
            .then(async seized_orders => {
              if (seized_orders.length > 0) {
                let seized_order_numbers = seized_orders.map(order => order.orderNumber);
                logger.log(`------------- ${day} SEIZED: ${seized_order_numbers} -------------`);
                await util.asyncForEach(seized_orders, async (i, order) => {
                  await telegramApi.editMessagesInTelegram(
                    order.sent_messages,
                    telegramApi.getEmptyReplyMarkupBotOptions(),
                    date
                  );
                });
              }
            })
            .then(() => { historyManager.closeConnections() })
            .catch(error => logger.log(error));

        });

      // ================= SEIZE ORDER AS
      // logInAs(settings, '1917042')
      // logInAs(settings, '253850760')
      //   .then(jar => parserApi.checkSeizeResult(requestGlobal, '4918996', jar))
      //   .then(orderSeized => {
      //     if (orderSeized) {
      //       console.log('YES');
      //     }
      //     else {
      //       console.log('NO');
      //     }
      //   })
      //   .catch(error => {
      //     console.log('ERROR');
      //     logger.log(error);
      //   });

      //   .then(jar => seizeOrder('http://lk.us.to/eng.php', jar))
      //   .then(body => logger.log(body))
      //   .catch(error => logger.log(error));

      // logIn(settings, (settings) => {parserApi.getOrderStatus(47703698);});

      // const Sequelize = require('sequelize');
      // const database = require('./config/database');
      // sequelize = new Sequelize(database[settings.get('env')]);
      // Order = sequelize.import("./models/order");
      //
      // historyManager
      //   .initOrdersHistory()
      //   .then(orders => { console.log('INIT COMPLETE'); })
      //   .then(result => {
      //
      //
      //     result = historyManager.dayHistoryIncludes('47653830');
      //     console.log('result', result)
      //     console.log('exit');
      //   });

      // console.log(util.getNowDate().toJSDate());
      key = util.getNowDate().toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
    }
  };
};

new test().test_run();

// module.exports = new test();