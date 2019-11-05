'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    // ORDERS
    // message_ids
    return queryInterface.addColumn('Orders', 'message_ids', { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: []})
      // .then(() => queryInterface.sequelize.query('ALTER TABLE "Orders" ALTER COLUMN message_ids SET DEFAULT array[]::varchar[]'))
      // .then(() => queryInterface.sequelize.query('UPDATE "Orders" SET message_ids = array[]::varchar[] WHERE message_ids IS NULL'))
      .then(
        () => queryInterface
          .addConstraint(
            'Orders',
            ['message_ids'],
            {
              type: 'check',
              where: {
                message_ids: {
                  [Sequelize.Op.not]: null
                }
              }
            }
          )
      )
      // order_seized
      .then(() => queryInterface.addColumn('Orders', 'seized', { type: Sequelize.BOOLEAN, defaultValue: false }))
      .then(
        () => queryInterface
          .addConstraint(
            'Orders',
            ['seized'],
            {
              type: 'check',
              where: {
                message_ids: {
                  [Sequelize.Op.not]: null
                }
              }
            }
          )
      )
      // ORDERBACKUPS
      // message_ids
      .then(() => queryInterface.addColumn('OrderBackups', 'message_ids', { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: []}))
      .then(
        () => queryInterface
          .addConstraint(
            'OrderBackups',
            ['message_ids'],
            {
              type: 'check',
              where: {
                message_ids: {
                  [Sequelize.Op.not]: null
                }
              }
            }
          )
      )
      // order_seized
      .then(() => queryInterface.addColumn('OrderBackups', 'seized', { type: Sequelize.BOOLEAN, defaultValue: false }))
      .then(
        () => queryInterface
          .addConstraint(
            'OrderBackups',
            ['seized'],
            {
              type: 'check',
              where: {
                message_ids: {
                  [Sequelize.Op.not]: null
                }
              }
            }
          )
      );
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('Orders', 'message_ids')
      .then(() => queryInterface.removeColumn('Orders', 'seized'))
      .then(() => queryInterface.removeColumn('OrderBackups', 'message_ids'))
      .then(() => queryInterface.removeColumn('OrderBackups', 'seized'));
  }
};
