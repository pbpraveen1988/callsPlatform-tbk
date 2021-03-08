const multer = require('multer');
const path = require('path');
const moment = require('moment');
const fs = require('fs')
const { v4: uuidv4 } = require('uuid');
const utils = require("../utils");
const { Campaign } = require("../models/campaign");
const { CallHistory } = require("../models/call-history");
const { message } = require("../global/messages");
const constants = require("../global/constants");
const { promisify } = require('util');
const { sync } = require('mkdirp');
const { default: axios } = require('axios');
const unlinkAsync = promisify(fs.unlink);
const { MYSQLDB } = require('../global/constants');
const http = require('http'); // or 'https' for https:// URLs
const https = require('https');
const { PUBLIC_FOLDER_NAME, ASSET_FOLDER_PATH, RinglessDB, VMDROP_URL, MISSED_CALL_NUMBER, ASTERISKSERVER_URL, API_KEY, TELNYX_TOKEN, TELNYX_URL, LOCAL_URL, PROD_URL, CALLBACK_PATH, AUDIO_FOLDER_PATH, ASTERISKSERVER_URL_MULTIPLE } = require('../global/constants');

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
  //console.log('Gobil: callback response->', req.body);
  const uuid = req.body.uuid; // TODO

  const history = await CallHistory.findOne({ uuid });
  await CallHistory.editCallHistoryByUuid({
    ...req.body,
    // TODO
  });

  return res.status(200).send();
}

exports.rvmMultiple = async (req, res) => {
  try {
    const bodyData = req.body;
    const requestbody = await Promise.all(bodyData && bodyData.map(async body => {
      if (!body.lead_phone) {
        res.contentType('application/json');
        res.status(400).json({ message: `Lead phone is required` });
        return;
      }
      if (!body.audio_url) {
        res.contentType('application/json');
        res.status(400).json({ message: `audio_url is required` });
        return;
      }
      const record = {
        audio_url: body.audio_url,
        lead_phone: body.lead_phone,
        callback_url: body.callback_url,
        external_id1: body.external_id1,
        external_id2: body.external_id2,
        external_id3: body.external_id3,
        external_id4: body.external_id4,
        forward: body.forward,
        drop_method: body.drop_method,
        missed_call_caller_id: body.missed_call_caller_id,
        missed_call_pool: body.missed_call_pool,
        missed_call: body.missed_call,
        provider: 'telnyx',
        retry: 1
      }

      let number;
      try {
        number = await getCarriers([record.lead_phone]);
        if (number && number.length > 0) {
          record.carrier = number[0].carrier;
          record.carrier_raw = number[0].carrier_raw;
          record.number_type = number[0].number_type;
        } else {
          record.carrier = 'INVALID CARRIER';
          record.carrier_raw = 'INVALID CARRIER';
          record.number_type = 'cell';
        }
      } catch (ex) {
        record.carrier = 'VERIZON';
        record.carrier_raw = 'VERIZON';
        record.number_type = 'cell';
      }
      try {
        if (body.external_id2) {
          utils.getCampaignLog(body.external_id2, 'VMDROP PARAMS via API', record);
        }
      } catch (e) {
      }
      return record;
    }));


    const failedBody = requestbody.filter(x => x.carrier === 'INVALID CARRIER');
    const successBody = requestbody.filter(x => x.carrier !== 'INVALID CARRIER');
    let __responses = [];
    if (failedBody.length) {
      const _failedResponses = await Promise.all(failedBody && failedBody.map(async (body) => {
        return await failedResponse(body);
      }));
      __responses = __responses.concat(_failedResponses);
    }

    if (successBody.length) {
      const successRespose = await axios.post(ASTERISKSERVER_URL_MULTIPLE, successBody).catch(err);
      if (successRespose.data && successRespose.data.length) {
        __responses = __responses.concat(successRespose);
      }
    }

    res.contentType('application/json');
    res.status(200).json(__responses);
    return __responses;
  } catch (err) {
    res.contentType('application/json');
    res.status(500).json(err);
  }

  // return axios.post(ASTERISKSERVER_URL_MULTIPLE, requestbody)
  //   .then(response => {
  //     res.contentType('application/json');
  //     res.status(200).json(response.data);
  //     return response;
  //   }).catch(err => {
  //     res.contentType('application/json');
  //     res.status(500).json(err);
  //   })
}


exports.rvm = async (req, res) => {

  const body = req.body;
  console.log('API REQ BODY', body);
  if (!body.lead_phone) {
    res.contentType('application/json');
    res.status(400).json({ message: `Lead phone is required` });
    return;
  }
  if (!body.audio_url) {
    res.contentType('application/json');
    res.status(400).json({ message: `audio_url is required` });
    return;
  }

  let audio_url = body.audio_url;
  const _filename = Date.now() + '_' + body.external_id1 + '.wav';
  const file = fs.createWriteStream(constants.PUBLIC_FOLDER_NAME + constants.ASSET_FOLDER_PATH + _filename);
  let __response;
  if (audio_url.includes('https')) {
    __response = await https.get(audio_url);
  } else {
    __response = await http.get(audio_url);
  }
  await __response && __response.pipe(file);


  audio_url = 'http://138.68.245.156:4000/'+ AUDIO_FOLDER_PATH + _filename;




  const record = {
    audio_url: audio_url,
    lead_phone: body.lead_phone,
    callback_url: body.callback_url,
    external_id1: body.external_id1,
    external_id2: body.external_id2,
    external_id3: body.external_id3,
    external_id4: body.external_id4,
    forward: body.forward,
    drop_method: body.drop_method,
    missed_call_caller_id: body.missed_call_caller_id,
    missed_call_pool: body.missed_call_pool,
    missed_call: body.missed_call,
    provider: 'telnyx',
    retry: 1
  }

  let number;
  try {
    number = await getCarriers([record.lead_phone]);
    if (number && number.length > 0) {
      record.carrier = number[0].carrier;
      record.carrier_raw = number[0].carrier_raw;
      record.number_type = number[0].number_type;
    } else {
      record.carrier = 'INVALID CARRIER';
      record.carrier_raw = 'INVALID CARRIER';
      record.number_type = 'cell';
    }
  } catch (ex) {
    record.carrier = 'VERIZON';
    record.carrier_raw = 'VERIZON';
    record.number_type = 'cell';
  }
  try {
    if (body.external_id2) {
      utils.getCampaignLog(body.external_id2, 'VMDROP PARAMS via API', record);
    }
  } catch (e) {

  }

  if (record.carrier === 'INVALID CARRIER') {
    const _record = await failedResponse(record);
    res.contentType('application/json');
    res.status(500).json(_record);
    return;
  } else {
    return axios.post(ASTERISKSERVER_URL, record)
      .then(response => {
        if (response.data.status === 'failed') {
          res.contentType('application/json');
          res.status(500).json(response.data);
          return response;
        }
        res.contentType('application/json');
        res.status(200).json(response.data);
        return response;
      }).catch(err => {
        res.contentType('application/json');
        res.status(500).json(err);
      })
  }
}




// GET CARRIER  INFORMATION FROM THE TABLE
const getCarriers = async (numbers) => {
  return new Promise(function (resolve, reject) {
    console.time('API_SQL_DATA');
    console.log('API CALLING SP');
    // const query = `SELECT s.name AS 'CarrierName', s.carrier_type , l.TN AS 'Number',l.LRN AS 'XREF' FROM service_providers s INNER JOIN lrn_data l ON  s.SPID = l.SPID WHERE  l.TN IN (${_inArray})`;
    let paramString = '';
    numbers && numbers.forEach((x, index) => {
      if (x) {
        if (index != 0) {
          paramString += ',';
        }
        let _newString = "'" + x.toString().trim() + "'";
        _newString = _newString.replace(/'/g, "\\'");
        paramString += _newString;
      }
    });
    const query = `CALL GetCarriers('${paramString}')`;
    const connection = MYSQLDB();
    connection.query(query, function (solution, msg) {
      console.log('API response from SP');
      if (msg) {
        reject(msg);
        return console.error(msg);
      }
      const result = solution && solution[0];
      const _results = [];
      result && result.forEach((res) => {
        let _carrierName;
        if (res.CarrierName) {
          _carrierName = getCarrierName(res.CarrierName);
        } else {
          _carrierName = 'INVALID CARRIER';
        }
        const number_type = getServiceProviderType(res.sp_type);
        _results.push({
          carrier: _carrierName,
          carrier_raw: res.CarrierName ? res.CarrierName : _carrierName,
          number_type
        });
      });

      if (result) {
        const _diff = numbers.length - result.length;
        if (_diff > 0) {
          try {
            const values = findDeselectedItem(result, numbers);
            values && values.forEach(res => {
              let _carrierName;
              if (res.CarrierName) {
                _carrierName = getCarrierName(res.CarrierName);
              } else {
                _carrierName = 'INVALID CARRIER';
              }
              const number_type = getServiceProviderType(res.sp_type);
              _results.push({
                carrier: _carrierName,
                carrier_raw: res.CarrierName ? res.CarrierName : _carrierName,
                number_type
              });
            });
          } catch (Ex) {
            console.error('Error on delsecting the item');
          }
        }
      }


      console.timeEnd('API_SQL_DATA');
      resolve(_results);
    });
  })
}


const findDeselectedItem = (CurrentArray, PreviousArray) => {

  var CurrentArrSize = CurrentArray.length;
  var PreviousArrSize = PreviousArray.length;

  const res = PreviousArray.filter((n) => {
    return CurrentArray.findIndex(y => y.Number === n) === -1;
  })

  return res;
}

const getCarrierName = (carrierName) => {
  if (!carrierName) {
    return 'INVALID CARRIER'; // by default setting as verizon.
  }

  if (carrierName.toString().toUpperCase().includes('CINGULAR')) {
    return 'CINGULAR'
  }
  if (carrierName.toString().toUpperCase().includes('T-MOBILE')) {
    return 'T-MOBILE'
  }
  if (carrierName.toString().toUpperCase().includes('VERIZON')) {
    return 'VERIZON'
  }
  return 'INVALID CARRIER';

}

const getServiceProviderType = (service_provider_type) => {
  if (service_provider_type == 1) {
    return 'landline';
  } else if (service_provider_type == 2) {
    return 'cell';
  } else if (service_provider_type == 3) {
    return 'voip';
  } else if (service_provider_type == 4) {
    return 'non-carrier';
  } else {
    return 'cell';
  }
}



const failedResponse = async (data) => {
  const _record = {
    CallId: uuidv4(),
    DropId: uuidv4(),
    PhoneTo: data.lead_phone,
    //PhoneFrom: rec.PhoneFrom,
    CallStatus: 'failed',
    MissedCallFrom: data.missed_call_caller_id,
    DateAddedToQueue: moment().valueOf(),
    Carrier: 'UNSUPPORTED CARRIER',
    Provider: 'telnyx',
    ChannelCreatedTime: moment().valueOf(),
    CallStartTime: moment().valueOf(),
    CallAnsweredTime: moment().valueOf(),
    PlaybackStartedTime: moment().valueOf(),
    PlaybackEndedTime: moment().valueOf(),
    CallEndedTime: moment().valueOf(),
    IsError: true,
    ErrorMessage: 'The Carrier Listed Is Not Supported By This Module',
    DateCreated: moment().valueOf(),
    StartDate: moment().valueOf(),
    EndDate: moment().valueOf(),
    TotalSeconds: 0,
    TotalCost: 0,
    Cost: 0,
    Attempts: 0,
    Invalid: false,
    SentToCallback: false,
    uuid: uuidv4(),
    CampaignId: data.external_id2,
    external_id1: data.external_id1,
    external_id3: data.external_id3,
    external_id4: data.external_id4,
    number_type: '',
    callback_url: data.callback_url,
    drop_method: data.drop_method,
    carrier_raw: 'UNSUPPORTED CARRIER',
    forward: data.forward
  }
  const _dbCon = RinglessDB();
  const _newData = await _dbCon.collection('responses').insertOne(_record);
  return {
    id: _record.DropId,
    uuid: _record.uuid,
    status: 'failed',
    carrier: _record.Carrier,
    message: _record.ErrorMessage,
    carrier_raw: _record.carrier_raw,
  };
}