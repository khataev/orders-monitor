'use strict';
module.exports = (sequelize, DataTypes) => {
  const OrderBackup = sequelize.define('OrderBackup', {
    date: DataTypes.DATEONLY,
    orderNumber: DataTypes.STRING,
    eid: DataTypes.STRING,
    sent_messages: DataTypes.JSONB,
    seized: DataTypes.BOOLEAN,
    // TODO: deprecated
    message_ids: DataTypes.ARRAY(DataTypes.STRING)
  }, {});
  OrderBackup.associate = function (models) {
    // associations can be defined here
  };
  return OrderBackup;
};