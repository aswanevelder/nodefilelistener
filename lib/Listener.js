const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class Listener extends EventEmitter {
    constructor(options) {
        super();
        this._setOptions(options);
    }

    async listen(callback) {
        this._logInfo('Start listening for files at ' + this.directory);
        await this._readDirectory((err) => {
            if (err) {
                callback(err);
                this._logError(err.message);
            }
        });

        if (this.interval > 0) {
            this.timer = setInterval(async () => {
                await this._readDirectory((err) => {
                    callback(err);
                    this._logError(err.message);
                });
            }, this.interval);
        }
    }

    stop() {
        clearInterval(this.timer);
        this._logInfo('Listener stopped');
    }

    async _readDirectory(callback) {
        await fs.stat(this.directory, async (err, stats) => {
            if (err) {
                callback(err);
                this._logError(err.message);
            }
            else {
                if (stats.isDirectory) {
                    await fs.readdir(this.directory, async (err, files) => {
                        if (err) {
                            callback(err);
                            this._logError(err.message);
                        }
                        else {
                            if (files) {
                                await this._getFiles(files.filter(fn => fn.endsWith(this.fileext)), (err) => {
                                    callback(err);
                                    this._logError(err.message);
                                });
                            }
                        }
                    });
                }
                else {
                    const err = Error(this.directory + ' is not a directory.');
                    callback(err);
                    this._logError(err.message);
                }
            }
        });
    }

    async _logInfo(event) {
        this.emit('log', { entry: event, level: 'info', timestamp: Date.now() });
    }

    async _logError(event) {
        this.emit('log', { entry: event, level: 'error', timestamp: Date.now() });
    }

    async _getFiles(files, callback) {
        let filesfound = [];
        for (let x = 0; x < files.length; x++) {
            const fileName = files[x];
            const timeStamp = Date.now();
            let type = fileName.match(this.typematch);
            type = (type) ? type[0] : '';

            const fileInfo = {
                fileName: fileName,
                timeStamp: timeStamp,
                counter: x,
                type: type
            };

            let backupFilename = fileInfo.fileName;
            if (this.mustrename) {
                filesfound.push(this._renameFileSync(fileInfo));
                backupFilename = fileInfo.renamed;
            }
            else {
                filesfound.push(fileInfo);
            }

            if (this.mustbackup) {
                await this._backupFile(backupFilename, (err) => {
                    console.log(err);
                    callback(err);
                })
            }
        }

        if (filesfound.length > 0) {
            this.emit('loaded', filesfound);
        }
    }

    _renameFileSync(fileInfo) {
        let renameFile;
        const fromFile = path.join(this.directory, fileInfo.fileName);
        renameFile = this.renametemplate
            .replace('[TYPE]', fileInfo.type)
            .replace('[TIMESTAMP]', fileInfo.timeStamp)
            .replace('[COUNTER]', fileInfo.counter);
        const toFile = path.join(this.directory, renameFile);
        fileInfo.renamed = renameFile;

        fs.renameSync(fromFile, toFile);
        this._logInfo(`File renamed: ${toFile}`);

        return fileInfo;
    }

    async _backupFile(fileName, callback) {
        const from = path.join(this.directory, fileName);
        const to = path.join(this.backupdirectory, fileName);

        await fs.access(from, async (err) => {
            if (!err) {
                await fs.access(this.backupdirectory, async (err) => {
                    if (err)
                        fs.mkdirSync(this.backupdirectory);

                    await fs.copyFile(from, to, (err) => {
                        if (err)
                            callback(err);
                        else
                            this._logInfo('File backup: ' + fileName);
                    });
                })

            }
            else {
                callback(err);
            }
        });
    }

    async readFile(fileName) {
        await fs.readFile(path.join(this.directory, fileName), 'utf8', (err, data) => {
            if (!err) {
                console.log(data);
            }
            else
                console.log(err);
        });
    }

    _setOptions(options) {
        function _optionsMessage(param, env) {
            return `${param} not set, options.${param.toLowerCase()} or environment variable ${env}`;
        }

        if (options) {
            if (options.directory) this.directory = path.normalize(options.directory);
            if (options.interval) this.interval = options.interval;
            if (options.fileext) this.fileext = options.fileext;
            if (options.typematch) this.typematch = options.typematch;
            if (options.mustrename) this.mustrename = options.mustrename;
            if (options.renametemplate) this.renametemplate = options.renametemplate;
            if (options.mustbackup) this.mustbackup = options.mustbackup;
            if (options.backupdirectory) this.backupdirectory = options.backupdirectory;
        }

        this.directory = (this.directory) ? this.directory : path.normalize(process.env.FILELOADER_DIRECTORY);
        this.interval = (this.interval) ? this.interval : process.env.FILELOADER_INTERVAL;
        this.fileext = (this.fileext) ? this.fileext : process.env.FILELOADER_EXT;
        this.typematch = (this.typematch) ? this.typematch : process.env.FILELOADER_TYPEMATCH;
        this.mustrename = (this.mustrename) ? this.mustrename : process.env.FILELOADER_MUSTRENAME;
        this.renametemplate = (this.renametemplate) ? this.renametemplate : process.env.FILELOADER_RENAMETEMPLATE;
        this.mustbackup = (this.mustbackup) ? this.mustbackup : process.env.FILELOADER_MUSTBACKUP;
        this.backupdirectory = (this.backupdirectory) ? this.backupdirectory : process.env.FILELOADER_BACKUPDIRECTORY;

        if (!this.directory) throw new Error(_optionsMessage('Directory', 'FILELOADER_DIRECTORY'));
        if (!this.fileext) throw new Error(_optionsMessage('FileExt', 'FILELOADER_EXT'));
        if (!this.interval) this.interval = 0;
        if (!this.typematch) this.typematch = /[^\-]*/;
        if (!this.mustrename) this.mustrename = true;
        if (!this.renametemplate) this.renametemplate = '[TYPE]-[TIMESTAMP]-[COUNTER].dat';
        if (!this.mustbackup) this.mustbackup = true;
        if (!this.backupdirectory) this.backupdirectory = path.join(this.directory, '_backup');
    }
}

module.exports = Listener;
