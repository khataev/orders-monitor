'use strict';
module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    date: DataTypes.DATEONLY,
    orderNumber: DataTypes.STRING,
    message_ids: DataTypes.ARRAY(DataTypes.STRING),
    seized: DataTypes.BOOLEAN
  }, {});
  Order.associate = function(models) {
    // associations can be defined here
  };
  return Order;
};