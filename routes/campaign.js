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
const { outboundData, PUBLIC_FOLDER_NAME, ASSET_FOLDER_PATH, RinglessDB, VMDROP_URL, MISSED_CALL_NUMBER, ASTERISKSERVER_URL, API_KEY, TELNYX_TOKEN, TELNYX_URL, LOCAL_URL, PROD_URL, CALLBACK_PATH, AUDIO_FOLDER_PATH, ASTERISKSERVER_URL_MULTIPLE } = require('../global/constants');

const storage = multer.diskStorage({
  destination: constants.PUBLIC_FOLDER_NAME + constants.ASSET_FOLDER_PATH,
  filename: function (req, file, cb) {
    cb(null, file.fieldname + utils.generateRandomId() + path.extname(file.originalname));
  }
});
const db = RinglessDB();
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
    //  console.log("gob: getCampaigns error", error);
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
    // console.log("gob : [campaign route exports.upload files] error => ", error);
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
    // console.log("gob : [campaign route exports.addCampaign] error => ", error);
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
    // console.log("gob: editCampaign error", error);
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
        if (body.external_id1) {
          utils.getCampaignLog(body.external_id1, 'VMDROP PARAMS via API', record);
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

  const data = req.body;
  if (!data.lead_phone) {
    res.contentType('application/json');
    return res.status(400).json({ message: `Lead phone is required` });
    return;
  }
  if (!data.audio_url) {
    res.contentType('application/json');
    return res.status(400).json({ message: `audio_url is required` });
    return;
  }


  let number;
  try {
    number = await getCarriers([data.lead_phone]);
    if (number && number.length > 0) {
      data.carrier = number[0].carrier;
      data.carrier_raw = number[0].carrier_raw;
      data.number_type = number[0].number_type;
    } else {
      data.carrier = 'INVALID CARRIER';
      data.carrier_raw = 'INVALID CARRIER';
      data.number_type = 'cell';
    }
  } catch (ex) {
    data.carrier = 'INVALID CARRIER';
    data.carrier_raw = 'INVALID CARRIER';
    data.number_type = 'cell';
  }
  try {
    if (body.external_id1) {
      utils.getCampaignLog(body.external_id1, 'VMDROP PARAMS via API', record);
    }
  } catch (e) {

  }

  // // MAKE FAILED 
  // const _record = await failedResponse(data);
  // res.contentType('application/json');
  // res.status(500).json(_record);
  // return;

  let isFailedCarrier = false;

  if (getCarrierName(data.carrier) == 'INVALID CARRIER' ||
    (getCarrierName(data.carrier) != 'VERIZON' &&
      getCarrierName(data.carrier) != 'T-MOBILE' &&
      getCarrierName(data.carrier) != 'CINGULAR'
    )) {
    isFailedCarrier = true;
  }

  if (isFailedCarrier) {
    const _record = await failedResponse(data);
    res.contentType('application/json');
    return res.status(500).json(_record);
  } else {
    /**SAVING TO OUTBOUND FROM HERE ONLY NOT GOING TO SEND TO TVM */
    //#region OUBOUND DATA

    let insertable = 'outbound_waiting';

    let _newData = {};
    try {
      let resp = null;
      _newData.SentToAsterisk = false;
      _newData.ReceivedResponse = false;
      _newData.DateAdded = moment().valueOf();
      _newData.DateModified = moment().valueOf();
      if (data.missed_call && (data.missed_call === 'TRUE' || data.missed_call === 'T')) {
        _newData.SendMissedCall = true;
      } else if (typeof data.missed_call !== 'boolean') {
        _newData.SendMissedCall = true;
      }
      if (data.missed_call || data.drop_method === 'both') {
        _newData.SendMissedCall = true;
      }
      if (data.lead_phone.length > 10) {
        _newData.PhoneTo = data.lead_phone.slice(1);
      } else if (data.lead_phone.length === 10) {
        _newData.PhoneTo = data.lead_phone;
      }
      if (data.phone_from) {
        if (data.phone_from.toString().length > 10) {
          _newData.PhoneFrom = data.phone_from.slice(1);
        } else if (data.phone_from.length === 10) {
          _newData.PhoneFrom = data.phone_from;
        }
      } else {
        if (data.missed_call_caller_id) {
          if (data.missed_call_caller_id.toString().length > 10) {
            _newData.PhoneFrom = data.missed_call_caller_id.slice(1);
          } else if (data.missed_call_caller_id.length === 10) {
            _newData.PhoneFrom = data.missed_call_caller_id;
          }
        }
      }
      if (_newData.SendMissedCall && data.missed_call_caller_id && data.missed_call_caller_id.toString().length > 1) {
        _newData.MissedCallFrom = data.missed_call_caller_id;
      } else if (_newData.SendMissedCall) {
        _newData.MissedCallFrom = '2542636150';
      }
      _newData.Carrier = data.carrier;
      _newData.VMAudio = data.audio_url;
      _newData.Provider = data.provider || 'telnyx';
      _newData.Retry = data.retry || 1;
      _newData.DropId = Date.now() + '_' + uuidv4();
      _newData.uuid = uuidv4();
      _newData.CampaignId = data.external_id1;
      _newData.DropId = Date.now() + '_' + uuidv4(); //Math.floor(100000000 + Math.random() * 900000000);
      _newData.uuid = uuidv4();
      _newData.external_id1 = data.external_id1;
      _newData.external_id2 = data.external_id2;
      _newData.external_id3 = data.external_id3;
      _newData.external_id4 = data.external_id4;
      _newData.missed_call_pool = data.missed_call_pool;
      _newData.drop_method = data.drop_method == 'both' ? 'ringless' : data.drop_method;
      _newData.callback_url = data.callback_url;
      _newData.forward = data.forward;
      //extra params
      _newData.carrier_raw = data.carrier_raw;
      _newData.number_type = data.number_type;
      //checking for areacode DID number to give missed
      if (_newData.SendMissedCall && _newData.PhoneTo && _newData.PhoneTo.toString().length > 1) {
        const areaCode = _newData.PhoneTo.toString().substring(0, 3);
        const phxref = await db.collection('phonexref').findOne({ carrier: 'TELNYX_IVR', xref: areaCode });
        if (phxref && phxref.phone) {
          _newData.MissedCallFrom = phxref.phone;
        }
      }
      await db.collection(insertable).insertOne(_newData);
      _newData.message = 'saved_record';
      // return true;
    } catch (err) {
      _newData.isError = true;
      _newData.message = err.message;
    }

    let __carrier = '';
    if (_newData.Carrier === 'T-MOBILE') {
      __carrier = 'tmobile';
    } else if (_newData.Carrier == 'CINGULAR') {
      __carrier = 'att';
    } else if (_newData.Carrier == 'VERIZON') {
      __carrier = 'verizon'
    } else {
      __carrier = 'unsupported ' + _newData.number_type;
    }

    if (_newData.isError) {

      return res.contentType('application/json').status(500).json({
        id: x.DropId,
        uuid: x.uuid,
        status: _newData.isError ? 'failed' : 'success',
        carrier: __carrier,
        message: _newData.message,
        carrier_raw: _newData.carrier_raw,
        number_type: _newData.number_type
      });
      return;
    } else {
      return res.contentType('application/json').status(200).json({
        id: _newData.DropId,
        uuid: _newData.uuid,
        status: _newData.isError ? 'failed' : 'success',
        carrier: __carrier,
        message: _newData.message,
        carrier_raw: _newData.carrier_raw,
        number_type: _newData.number_type
      });
    }
  }

}




// GET CARRIER  INFORMATION FROM THE TABLE
const getCarriers = async (numbers) => {
  return new Promise(function (resolve, reject) {
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
      //console.log('API response from SP');
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
            //   console.error('Error on delsecting the item');
          }
        }
      }
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
    return 'INVALID CARRIER'
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

  return carrierName;

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
  let _record = {
    CallId: uuidv4(),
    DropId: uuidv4(),
    PhoneTo: data.lead_phone,
    //PhoneFrom: rec.PhoneFrom,
    CallStatus: 'failed',
    MissedCallFrom: data.missed_call_caller_id,
    DateAddedToQueue: moment().valueOf(),
    Carrier: data.carrier,
    Provider: 'telnyx',
    ChannelCreatedTime: moment().valueOf(),
    CallStartTime: moment().valueOf(),
    CallAnsweredTime: moment().valueOf(),
    PlaybackStartedTime: moment().valueOf(),
    PlaybackEndedTime: moment().valueOf(),
    CallEndedTime: moment().valueOf(),
    IsError: true,
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
    CampaignId: data.external_id1,
    external_id2: data.external_id2,
    external_id1: data.external_id1,
    external_id3: data.external_id3,
    external_id4: data.external_id4,
    number_type: data.number_type,
    callback_url: data.callback_url,
    drop_method: data.drop_method,
    carrier_raw: data.carrier_raw,
    forward: data.forward
  }

  let __carrier = '';
  if (data.Carrier === 'T-MOBILE') {
    __carrier = 'tmobile';
  } else if (data.Carrier == 'CINGULAR') {
    __carrier = 'att';
  } else if (data.Carrier == 'VERIZON') {
    __carrier = 'verizon'
  } else {
    __carrier = 'unsupported carrier';
  }

  if (data.number_type === 'cell') {
    _record.ErrorMessage = 'unsupported cell';
  } else if (data.number_type === 'landline') {
    _record.ErrorMessage = 'home phone';
  } else {
    _record.ErrorMessage = 'unsupported ' + data.number_type;
  }



  const _dbCon = RinglessDB();
  const _newData = await _dbCon.collection('responses').insertOne(_record);
  return {
    id: _record.DropId,
    uuid: _record.uuid,
    status: 'failed',
    carrier: __carrier,
    message: _record.ErrorMessage,
    carrier_raw: _record.carrier_raw,
  };
}




var download = function (url, dest, cb) {
  if (fs.existsSync(dest)) {
    cb();
    return;
  }
  const file = fs.createWriteStream(dest);
  if (url.includes('https')) {
    var request = https.get(url, function (response) {
      response.pipe(file);
      file.on('finish', function () {
        file.close(cb);  // close() is async, call cb after close completes.
      });
    }).on('error', function (err) { // Handle errors
      fs.unlink(dest); // Delete the file async. (But we don't check the result)
      if (cb) cb(err.message);
    });
  } else {
    var request = http.get(url, function (response) {
      response.pipe(file);
      file.on('finish', function () {
        file.close(cb);  // close() is async, call cb after close completes.
      });
    }).on('error', function (err) { // Handle errors
      fs.unlink(dest); // Delete the file async. (But we don't check the result)
      if (cb) cb(err.message);
    });
  }
};