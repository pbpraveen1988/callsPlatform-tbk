const fs = require('fs');
const sox = require('sox-stream');
const { PUBLIC_FOLDER_NAME, ASSET_FOLDER_PATH, AUDIO_FOLDER_PATH } = require('../global/constants');
const mkdirp = require('mkdirp');
const exec = require('child_process').exec;



const writeFile = (path, contents, cb) => {
    mkdirp(getDirName(path), function (err) {
        if (err) return cb(err);

        fs.writeFile(path, contents, cb);
    });
}

exports.convertFilesToAsteriskFormat = async timer => {
    const directoryPath = PUBLIC_FOLDER_NAME + ASSET_FOLDER_PATH;
    const outputPath = PUBLIC_FOLDER_NAME + AUDIO_FOLDER_PATH;
    const tempPath = PUBLIC_FOLDER_NAME + '/tmp/';
    mkdirp(tempPath).then(res => {
        fs.readdir(directoryPath, function (err, files) {
            //handling error
            if (err) {
                return console.log('Unable to scan directory: ' + err);
            }
            //listing all files using forEach
            files.forEach(function (file) {
                try {
                    const name = file.split('.');
                    if (name[1] != 'csv') {

                        let convertCmd = '';

                        if (name[1] === 'wav') {
                            convertCmd = `sox ${directoryPath + file} -c 1 -r 8000 ${tempPath + file}`;
                        } else {
                            convertCmd = `sox ${directoryPath + file} -v 0.5 -t wav - -t wav -b 16 -r 8000 -c 1 ${tempPath + file}`
                        }


                        const child = exec(convertCmd,
                            (error, stdout, stderr) => {
                                console.log(`stdout: ${stdout}`);
                                console.log(`stderr: ${stderr}`);
                                console.log('file converted =>', tempPath + file)
                                if (error !== null) {
                                    console.log(`exec error: ${error}`);
                                }
                                mkdirp(outputPath).then(resp => {
                                    let convertTempCmd = '';
                                    if (name[1] === 'wav') {
                                        convertTempCmd = `sox ${tempPath + file} -c 1 -r 8000 ${outputPath + file}`;
                                    } else {
                                        convertTempCmd = `sox ${tempPath + file} -v 0.5 -t wav - -t wav -b 16 -r 8000 -c 1 ${outputPath + file}`
                                    }
                                    exec(convertTempCmd,
                                        (error, stdout, stderr) => {
                                            try {
                                                fs.unlinkSync(directoryPath + file);
                                                fs.unlinkSync(tempPath + file);
                                                //file removed
                                            } catch (err) {
                                                console.error('error while removing the file ')
                                            }

                                        })
                                })

                            });



                        // console.log(name);
                        // var src = fs.createReadStream(directoryPath + file);
                        // var lowerVolume = sox({
                        //     output: {
                        //         rate: 8000,
                        //         channels: 1,
                        //         type: 'wav'
                        //     }
                        // });
                        // mkdirp(outputPath).then(made => {
                        //     const dest = fs.createWriteStream(outputPath + name[0] + '.wav');
                        //     src.pipe(lowerVolume).pipe(dest);
                        //     console.log('CONVERTED THE FILE SUCCESSFULLY', file);
                        //     try {
                        //         fs.unlinkSync(directoryPath + file);
                        //         //file removed
                        //     } catch (err) {
                        //         console.error('error while removing the file ')
                        //     }
                        // })

                    }
                } catch (ex) {
                    console.log('ERROR WHILE FILE CONVERT  =>' + file);
                }
            });
        });
    });





}