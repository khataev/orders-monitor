'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('Orders', 'sent_messages', { type: Sequelize.JSONB, defaultValue: {}})
      .then(
        () => queryInterface
          .addConstraint(
            'Orders',
            ['sent_messages'],
            {
              type: 'check',
              where: {
                sent_messages: {
                  [Sequelize.Op.not]: null
                }
              }
            }
          )
      )
      .then(() => queryInterface.addColumn('OrderBackups', 'sent_messages', { type: Sequelize.JSONB, defaultValue: {}}))
      .then(
        () => queryInterface
          .addConstraint(
            'OrderBackups',
            ['sent_messages'],
            {
              type: 'check',
              where: {
                sent_messages: {
                  [Sequelize.Op.not]: null
                }
              }
            }
          )
      )
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('Orders', 'sent_messages')
      .then(() => queryInterface.removeColumn('OrderBackups', 'sent_messages'))
  }
};
