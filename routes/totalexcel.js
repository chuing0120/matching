var express = require('express');
var router = express.Router();
var path = require('path');
var async = require('async');
var uuid = require('uuid');
var fs = require('fs');
var mime = require('mime');
var AWS = require('aws-sdk');
var s3Config = require('../config/s3Config');
var bcrypt = require('bcrypt');
var sqlAes = require('./sqlAES');
var XLSX = require('xlsx');

sqlAes.setServerKey(serverKey);

router.get('/', function (req, res, next) {

	var workbook = XLSX.readFile(path.join(__dirname, '../uploads/excel', 'test.xlsx'));
	var sheet;

	function getConnection(callback) {
		pool.getConnection(function (err, connection) {
			if (err) {
				callback(err);
			} else {
				callback(null, connection);
			}
		});
	}


	function generateSalt(connection, callback) {
		var rounds = 10;
		bcrypt.genSalt(rounds, function (err, salt) {
			if (err) {
				callback(err);
			} else {
				callback(null, salt, connection);
			}
		})
	}

	function insertMembers(salt, connection, callback) {
		async.eachSeries(sheet, function (item, callback) {
			var sql = "INSERT INTO matchdb.user(password, username, nickname, intro, genre, position, photo_path) " +
				"VALUES(?, ?, ?, ?, ?, ?, ?)";
			bcrypt.hash(item.password, salt, function (err, hashPassword) {
				if (err) {
					callback(err);
				} else {
					connection.query(sql, [hashPassword, item.username, item.nickname, item.intro, item.genre, item.position, item.photo_path],
						function (err, result) {
							if (err) {
								connection.release();
								var err = new Error('user 데이터 생성에 실패하였습니다.');
							} else {
								callback(null);
							}
						});
				}
			});
		}, function (err) {
			if (err) {
				console.log("fail!!!");
				callback(err);
			} else {
				console.log("success!!!");
				callback(null, connection)
			}
		});
	}

	function insertPost(connection, callback) {
		async.eachSeries(sheet, function (item, callback) {
			var sql = "INSERT INTO matchdb.post (title, content, limit_people, decide_people, user_id) " +
				"VALUES(?, ?, ?, ?, ?)"
			connection.query(sql, [item.title, item.content, item.limit_people,
					item.decide_people, item.user_id],
				function (err, result) {
					if (err) {
						connection.release();
						var err = new Error('post 데이터 생성에 실패하였습니다.');
					} else {
						callback(null);
					}
				});
		}, function (err) {
			if (err) {
				console.log("fail!!!");
				callback(err);
			} else {
				console.log("success!!!");
				callback(null, connection)
			}
		});
	}

	function insertInterest(connection, callback) {
		async.each(sheet, function (item, callback) {
			var sql = "INSERT INTO matchdb.interest(genre, position, post_id) " +
				"VALUES(?, ?, ?)";
			connection.query(sql, [item.genre, item.position, item.post_id],
				function (err, result) {
					if (err) {
						connection.release();
						var err = new Error('interest 데이터 생성에 실패하였습니다.');
					} else {
						callback(null);
					}
				});
		}, function (err, result) {
			if (err) {
				connection.release();
				console.log("fail!!!");
				callback(err);
			} else {
				connection.release();
				console.log("success!!!");
				callback(null, result);
			}
		})
	}

	function insertComment(connection, callback) {
		async.each(sheet, function (item, callback) {
			var sql = "INSERT INTO matchdb.comment(content, post_id, user_id) " +
				"VALUES(?, ?, ?)";
			connection.query(sql, [item.content, item.post_id, item.user_id],
				function (err, result) {
					if (err) {
						connection.release();
						var err = new Error('comment 데이터 생성에 실패하였습니다.');
					} else {
						callback(null);
					}
				});
		}, function (err, result) {
			if (err) {
				connection.release();
				console.log("fail!!!");
				callback(err);
			} else {
				connection.release();
				console.log("success!!!");
				callback(null, result);
			}
		})
	}

	function insertfile(connection, callback) {
		async.eachSeries(sheet, function (item, callback) {
			var sql = "INSERT INTO matchdb.file (path, post_id) " +
				"VALUES (?, ?)";
			connection.query(sql, [item.path, item.post_id], function (err, result) {
				if (err) {
					callback(err);
				} else {
					callback(null);
				}
			});
		}, function (err) {
			if (err) {
				connection.release();
				console.log("fail!!!");
				callback(err);
			} else {
				connection.release();
				console.log("success!!!");
				callback(null);
			}
		});
	}


	async.eachSeries(workbook.SheetNames, function (item, callback) {
		var sheet_name = item;
		var worksheet = workbook.Sheets[sheet_name];
		sheet = XLSX.utils.sheet_to_json(worksheet);

		if (sheet_name === "user") {
			async.waterfall([getConnection, generateSalt, insertMembers], function (err, result) {
				if (err) {
					callback(err);
				} else {
					console.log('user', result);
					callback(null);
				}
			})
		}

		if (sheet_name === "post") {
			async.waterfall([getConnection, insertPost], function (err, result) {
				if (err) {
					callback(err);
				} else {
					console.log('post', result);
					callback(null);
				}
			});
		} else if (sheet_name === "interest") {
			async.waterfall([getConnection, insertInterest], function (err, result) {
				if (err) {
					callback(err);
				} else {
					console.log('interest', result);
					callback(null);
				}
			});
		} else if (sheet_name === "comment") {
			async.waterfall([getConnection, insertComment], function (err, result) {
				if (err) {
					callback(err);
				} else {
					console.log('comment', result);
					callback(null);
				}
			});
		} else if (sheet_name === "file") {
			async.waterfall([getConnection, insertfile], function (err, result) {
				if (err) {
					callback(err);
				} else {
					console.log('file', result);
					callback(null);
				}
			});
		}
	}, function (err) {
		if (err) {
			next(err);
		} else {
			var success = "insert가 성공하였습니다.";
			res.json(success);
		}
	});
});

module.exports = router;