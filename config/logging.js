var winston = require('winston');
var DailyRotateFile = require('winston-daily-rotate-file');

var config = {
	transports: [
		new winston.transports.Console({
			level: 'error'
		}),
		//new winston.transports.File({
		//	level: 'debug',
		//	filename: 'app.log'
		//}),
		//new fileRotateDate.FileRotateDate({
		//	level: 'debug',
		//	filename: 'app_daily.log',
		//	maxsize: 1024
		//}),
		new DailyRotateFile({ // level이 debug부터
			name : 'warnLogger',
			level: 'warn',
			filename: 'warn-',
			dataPattern: 'yyyy-mm-dd_HH_mm.log' // 분당 yyyy-mm-dd_HH-mm , 시간당 yyyy-mm-dd_HH , 하루당은 yyyy-mm-dd
		}),
		new DailyRotateFile({ // level이 debug부터
			level: 'debug',
			filename: 'debug-',
			dataPattern: 'yyyy-mm-dd_HH.log' // 분당 yyyy-mm-dd_HH-mm , 시간당 yyyy-mm-dd_HH , 하루당은 yyyy-mm-dd
		})
	]
};

module.exports = new winston.Logger(config);

