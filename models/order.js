'use strict';
module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    date: DataTypes.DATEONLY,
    orderNumber: DataTypes.STRING,
    eid: DataTypes.STRING,
    sent_messages: DataTypes.JSONB,
    seized: DataTypes.BOOLEAN,
    // TODO: deprecated
    message_ids: DataTypes.ARRAY(DataTypes.STRING)
  }, {});
  Order.associate = function (models) {
    // associations can be defined here
  };
  return Order;
};