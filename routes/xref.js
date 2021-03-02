
const { RinglessDB } = require('../global/constants');

exports.getPhoneXrefCount = async (req, res) => {
    try {
        const _dbCon = RinglessDB();
        const phoneXrefData = await _dbCon.collection('phonexref').find({ inUse: true }).toArray();
        const a = {};
        phoneXrefData.forEach(element => {
            if (a[element.xref]) {
                if (element.inUse) {
                    a[element.xref].count = a[element.xref].count + 1;
                }
            } else {
                a[element.xref] = { count: 0, Carrier: element.carrier };
                if (element.inUse) {
                    a[element.xref].count = 1;
                }
            }
        });
        console.log(a);
        const _Array = [];
        Object.keys(a).forEach(x => {
            _Array.push({ xref: x, activeLines: a[x].count, carrier: a[x].Carrier })
        })
        return res.status(200).json(_Array);
    } catch (error) {
        console.log("kevin: getCampaigns error", error);
        return res.status(500).json({
            message: 'something went wrong',
            error,
        });
    }
};


exports.reselAllLines = async (req, res) => {
    try {
        const _dbCon = RinglessDB();
        const xref = await _dbCon.collection('phonexref').find().toArray();
        await _dbCon.collection('phonexref').updateMany({}, { $set: { errCnt: 0, active: true, inUse: false } })
        //.update({ $set: { inUse: false, errCnt: 0 } });
        return res.status(200).json('success');
        //db.phonexref.update({},[{ $set: { active: true } } ],{ multi: true })
        //db.phonexref.update({},[{ $set: { errCnt: 0 } } ],{ multi: true })
    } catch (ex) {
        console.error(ex);
    }
}


exports.resetAllData = async (req, res) => {
    try {
        const db = RinglessDB();
        // const asteriskVMCampaigns = await db.collection('asteriskVMCampaign').find().toArray();
        // const fileDirectory = fs.realpathSync('public/');
        // asteriskVMCampaigns.map(async (asteriskVMCampaign) => {
        //   if (asteriskVMCampaign.xrefCsvFileName) {
        //     const csvFilePath = path.join(fileDirectory, asteriskVMCampaign.xrefCsvFileName);
        //     await unlinkAsync(csvFilePath);
        //   }
        //   if (asteriskVMCampaign.dialListCsvFileName) {
        //     const csvFilePath = path.join(fileDirectory, asteriskVMCampaign.dialListCsvFileName);
        //     await unlinkAsync(csvFilePath);
        //   }
        // })
        await db.collection('phonexref').remove();
        //await db.collection('outbound').remove();
        //await db.collection('outbound_history').remove();
        //await db.collection('responses').remove();
        //await db.collection('responses_history').remove();
        return res.status(200).json('success');
    } catch (error) {
        console.log("kevin: getCampaigns error", error);
        return res.status(500).json({
            message: 'something went wrong',
            error,
        });
    }
};



exports.getPhoneXrefData = async (req, res) => {
    try {
        const _dbCon = RinglessDB();
        var mysort = { errCnt: -1 };
        const phoneXrefData = await _dbCon.collection('phonexref').find().sort(mysort).toArray();
        return res.status(200).json(phoneXrefData);
    } catch (error) {
        console.log("kevin: getCampaigns error", error);
        return res.status(500).json({
            message: 'something went wrong',
            error,
        });
    }
};