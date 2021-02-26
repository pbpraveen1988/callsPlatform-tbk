const multer = require('multer');
const path = require('path');
const fs = require('fs')

const utils = require("../utils");
const { Campaign } = require("../models/campaign");
const { CallHistory } = require("../models/call-history");
const { message } = require("../global/messages");
const constants = require("../global/constants");
const { promisify } = require('util');
const { sync } = require('mkdirp');
const { default: axios } = require('axios');
const unlinkAsync = promisify(fs.unlink)

const storage = multer.diskStorage({
  destination: constants.PUBLIC_FOLDER_NAME + constants.ASSET_FOLDER_PATH,
  filename: function (req, file, cb) {
    cb(null, file.fieldname + utils.generateRandomId() + path.extname(file.originalname));
  }
});

const CSV_FILE_FIELD = "csv-file";
const AUDIO_FILE_FIELD = "audio-file";

exports.uploadFiles = multer({
  storage: storage,
  limits: { fileSize: 9000000000 },
}).fields([{
  name: CSV_FILE_FIELD, maxCount: 1
}, {
  name: AUDIO_FILE_FIELD, maxCount: 1
}])

exports.getCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find();
    return res.status(200).json(campaigns);

  } catch (error) {
    console.log("gob: getCampaigns error", error);
    return res.status(500).json({
      message: message.SOMETHING_WENT_WRONG,
      error,
    });
  }
};

exports.uploadCampaign = async function (req, res, next) {
  try {
    const data = {
      CSV_FILE_FIELD: req.files[CSV_FILE_FIELD] && req.files[CSV_FILE_FIELD][0].filename,
      AUDIO_FILE_FIELD: req.files[AUDIO_FILE_FIELD] && req.files[AUDIO_FILE_FIELD][0].filename,
    };

    return res.status(200).json(data);

  } catch (error) {
    console.log("gob : [campaign route exports.upload files] error => ", error);
    return res.status(500).json({
      message: message.SOMETHING_WENT_WRONG,
      error,
    });
  }
};

exports.addCampaign = async (req, res) => {
  try {
    const campaginData = {
      _id: utils.generateRandomId(),
      userId: req.body.userId,
      campaignName: req.body.campaignName,
      callCenterNumber: req.body.callCenterNumber,
      missedCalls: req.body.missedCalls,
      missedCallPool: req.body.missedCallPool,
      csvFileName: req.body.csvFileName,
      audioFileName: req.body.audioFileName,
      intervalMinute: req.body.intervalMinute,
      campaignStartDate: req.body.campaignStartDate,
      campaignEndDate: req.body.campaignEndDate,
      callForwardNumber: req.body.callForwardNumber,
      callBackNumber: req.body.callBackNumber
    }
    const campaign = await Campaign.addCampaign(campaginData);
    return res.status(200).json(campaign);
  }

  catch (error) {
    console.log("gob : [campaign route exports.addCampaign] error => ", error);
    return res.status(500).json({
      message: message.SOMETHING_WENT_WRONG,
      error,
    });
  }
};

exports.editCampaign = async (req, res) => {
  try {
    const oldCampaign = await Campaign.findOne({ _id: req.body._id })
    const fileDirectory = fs.realpathSync('public/assets');
    const campaign = await Campaign.editCampaign(req.body);

    if (req.body && req.body.isPause) {
      axios.get(constants.TRUERINGLESS_URL + 'pauseCampaign?id=' + campaign._id).catch(err => console.error('err pause=>', err))
    }

    if (req.body && req.body.campaignStatus) {
      axios.get(constants.TRUERINGLESS_URL + 'resumeCampaign?id=' + campaign._id).catch(err => console.error('err pause=>', err))

    }

    if (req.body.audioFileName && oldCampaign.audioFileName !== req.body.audioFileName) {
      const audioFilePath = path.join(fileDirectory, oldCampaign.audioFileName);
      await unlinkAsync(audioFilePath);
    }

    if (req.body.csvFileName && oldCampaign.csvFileName !== req.body.csvFileName) {
      const csvFilePath = path.join(fileDirectory, oldCampaign.csvFileName);
      await unlinkAsync(csvFilePath);
    }

    return res.status(200).json(campaign);
  } catch (error) {
    console.log("gob: editCampaign error", error);
    return res.status(500).json({
      message: message.SOMETHING_WENT_WRONG,
      error,
    });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.query.id })
    await Campaign.removeCampaign(req.query.id);

    if (campaign.audioFileName) {
      try {
        const audioFile = fs.realpathSync('audio');
        const audioFilePath = path.join(audioFile, campaign.audioFileName);
        await unlinkAsync(audioFilePath);
      } catch (error) {
        console.log("audioFile ==> ", error);
      }
    }

    if (campaign.csvFileName) {
      try {
        const fileDirectory = fs.realpathSync('public/assets');
        const csvFilePath = path.join(fileDirectory, campaign.csvFileName);
        await unlinkAsync(csvFilePath);
      } catch (error) {
        console.log("audioFile ==> ", error);
      }
    }

    return res.status(200).json({ message: message.REMOVE_SUCCESS });

  } catch (error) {
    console.log("gob: deleteCampaign error", error);

    return res.status(500).json({
      message: message.SOMETHING_WENT_WRONG,
      error,
    });
  }
};



exports.callback = async (req, res) => {
  console.log('Gobil: callback response->', req.body);
  const uuid = req.body.uuid; // TODO

  const history = await CallHistory.findOne({ uuid });
  await CallHistory.editCallHistoryByUuid({
    ...req.body,
    // TODO
  });

  return res.status(200).send();
}


