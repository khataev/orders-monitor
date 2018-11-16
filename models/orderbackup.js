'use strict';
module.exports = (sequelize, DataTypes) => {
  const OrderBackup = sequelize.define('OrderBackup', {
    date: DataTypes.DATEONLY,
    orderNumber: DataTypes.STRING
  }, {});
  OrderBackup.associate = function(models) {
    // associations can be defined here
  };
  return OrderBackup;
};