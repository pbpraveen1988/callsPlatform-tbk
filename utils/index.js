const bcrypt = require("bcryptjs");
const { ObjectID } = require("bson");
const log4js = require('log4js');
const logger = log4js.getLogger('Campaign');

exports.isEmpty = (value) => {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "object" && Object.keys(value).length === 0) ||
    (typeof value === "string" && value.trim().length === 0)
  );
};


exports.getCampaignLog = (campaignId, loglabel, data) => {
  try {
    logger.addContext('campaignId', campaignId);
    logger.debug(loglabel, typeof (data) === 'object' ? JSON.stringify(data) : data);
  } catch (ex) {

  }
}

exports.getUserInfo = (user) => {

  const userInfo = {
    id: user._id,
    name: user.name,
    avatar: user.avatar,
    email: user.email
  };

  return userInfo;
};

exports.generateRandomId = () => {
  return new ObjectID().toString();
};
