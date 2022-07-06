'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('Orders', 'eid', { type: Sequelize.STRING })
      .then(() => queryInterface.addColumn('OrderBackups', 'eid', { type: Sequelize.STRING }))
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('Orders', 'eid')
      .then(() => queryInterface.removeColumn('OrderBackups', 'eid'))
  }
};
