var express = require('express');
var async = require('async');
var bcrypt = require('bcrypt');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var mime = require('mime');
var path = require('path');
var s3Config = require('../config/s3Config');
var async = require('async');
var fs = require('fs');
var router = express.Router();

// 로그인되야지만 인증
function isLoggedIn(req, res, next) {
	if (!req.isAuthenticated()) {
		var err = new Error('로그인이 필요합니다...');
		err.status = 401;
		next(err);
	} else {
		next();
	}
}

// get connection 전역으로
function getConnection(callback) {
	pool.getConnection(function (err, connection) {
		if (err) {
			callback(err);
		} else {
			callback(null, connection);
		}
	});
}

// 1. 회원가입 (HTTPS)
router.post('/', function(req, res, next) {
	if (req.secure) {
		var username = req.body.username;
		var nickname = req.body.nickname;
		var password = req.body.password;

		function selectUsername(connection, callback) {
			var sql = "SELECT id " +
									"FROM matchdb.user " +
									"WHERE username = ?";
			connection.query(sql, [username], function(err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						connection.release();
						var err = new Error('사용자가 이미 존재 하고있습니다.');
						err.status = 409;
						callback(err);
					} else {
						callback(null, connection);
					}
				}
			});
		}
		function selectNickname(connection, callback) {
			var sql = "SELECT id " +
				"FROM matchdb.user " +
				"WHERE nickname = ?";
			connection.query(sql, [nickname], function(err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						connection.release();
						var err = new Error('닉네임이 이미 존재하고 있습니다.');
						err.status = 409;
						callback(err);
					} else {
						callback(null, connection);
					}
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
		function generateHashPassword(salt, connection, callback) {
			bcrypt.hash(password, salt, function (err, hashPassword) {
				if (err) {
					callback(err);
				} else {
					callback(null, hashPassword, connection);
				}
			});
		}
		function insertMember(hashPassword, connection, callback) {
			var sql = "INSERT INTO matchdb.user (username, nickname, password) " +
									"VALUES (?, ?, ?)";
			connection.query(sql, [username, nickname, hashPassword], function (err, result) {
				connection.release();
				if (err) {
					callback(err);
				} else {
					callback(null, { "id": result.insertId 	});
				}
			})
		}
	} else {
		var err = new Error('SSL/TLS Upgrade Required');
		err.status = 426;
		next(err);
	}
	async.waterfall([getConnection, selectUsername, selectNickname, generateSalt,
		               generateHashPassword, insertMember], function (err, result) {
		if (err) {
			next(err);
		} else {
			var data = {
				success : "가입이 정상적으로 처리되었습니다."
			}
			res.json(data);
		}
	});
});
// 3. 내 프로필 조회 (HTTPS)
router.get('/me', isLoggedIn, function(req, res, next) {
	if (req.secure) {
		var userId = req.user.id;

		function selectMember(connection, callback) {
			var sql = "SELECT username, photo_path, nickname, intro, genre, position " +
									"FROM matchdb.user " +
									"WHERE id = ?";
			connection.query(sql, [userId], function (err, results) {
				connection.release();
				if (err) {
					callback(err)
				} else {
					callback(null, results);
				}
			})
		}
	async.waterfall([getConnection, selectMember], function (err, result) {
		if (err) {
			next(err);
		} else {
			var data = {
				"success" : {
						"message" : "회원프로필 정보가 정상적으로 조회되었습니다",
					"data" : result
				}
			};
			res.json(data);
		}
	});
	} else {
		var err = new Error('SSL/TLS Upgrade Required');
		err.status = 426;
		next(err);
	}
});
// 4. 다른 프로필 보기 (HTTPS)
router.get('/:mid', function(req, res, next) {
	if (req.secure) {
		var user = {
			"id": req.user.id,
			"mid": req.params.mid
		}
		function selectMember(connection, callback) {
			var sql = "SELECT username, photo_path, nickname, intro, genre, position " +
									"FROM matchdb.user " +
									"WHERE id = ?";
			connection.query(sql, [user.mid], function (err, results) {
				connection.release();
				if (err) {
					callback(err)
				} else {
					callback(null, results);
				}
			})
		}
	async.waterfall([getConnection, selectMember], function (err, result) {
		if (err) {
			err.message = "회원프로필 조회가 실패하였습니다.";
			next(err);
		} else {
			var data = {
				message : "회원프로필 정보가 정상적으로 조회되었습니다",
				success : result
			}
			res.json(data);
		}
	});
	} else {
		var err = new Error('SSL/TLS Upgrade Required');
		err.status = 426;
		next(err);
	}
});
// 5. 내 프로필 수정 (HTTPS)
router.put('/me', isLoggedIn, function (req, res, next) {
	if (req.secure) {
		var userId = req.user.id;
		var username = req.body.username;
		var password = req.body.password;
		var nickname = req.body.nickname;
		var intro = req.body.intro;
		var genre = req.body.genre;
		var position = req.body.position;

		function SelectUsername(connection, callback) {
			var sql = "SELECT id " +
								"FROM matchdb.user " +
								"WHERE username = ?";
			connection.query(sql, [username], function(err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						if(req.user.id !== results[0].id) {
							//connection.release(); //조심할것 아래에서 그냥 넘어감...=  수정 ㄷㄷ = 릴리즈터짐
							console.log('ssss다른아이디 존재');
							var err = new Error('다른 아이디가 이미 존재하고 있습니다.');
							err.status = 409;
							//next(err); //정상작동..?..
							callback(err);
						} else { //엘스로 안했더니 아래가 실행되면서 넘어가서 수정 진행됨 --;;  엘스 필수..........
							callback(null, connection);  //  릴리즈???????
						}

					} else {
						callback(null, connection);
					}
				}
			});
		}
		function SelectNickname(connection, callback) {
			var sql = "SELECT id " +
				"FROM matchdb.user " +
				"WHERE nickname = ?";
			connection.query(sql, [nickname], function(err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						if(req.user.id !== results[0].id) {
							//connection.release(); //조심할것 아래에서 그냥 넘어감...=  수정 ㄷㄷ = 릴리즈터짐
							console.log('ssss다른닉네임 존재');
							var err = new Error('다른 닉네임이 이미 존재하고 있습니다.');
							err.status = 409;
							//next(err); //정상작동..?..
							callback(err);
						} else { //엘스로 안했더니 아래가 실행되면서 넘어가서 수정 진행됨 --;;  엘스 필수..........
							callback(null, connection);  //  릴리즈???????
						}

					} else {
						callback(null, connection);
					}
				}
			});
		}
		function generateSalt(connection, callback) {
			var rounds = 10;
			bcrypt.genSalt(rounds, function(err, salt) {
				if (err) {
					callback(err);
				} else {
					callback(null, salt, connection);
				}
			});
		}
		function generateHashPassword(salt, connection, callback) {
			bcrypt.hash(password, salt, function(err, hashPassword) {
				if (err) {
					callback(err);
				} else {
					callback(null, hashPassword, connection);
				}
			});
		}
		function UpdateMember(hashPassword, connection, callback) {
			var sql = "UPDATE user " +
									"SET username=?, password=? , nickname=?, intro=?, genre=?, position=? " +
									"WHERE id = ?";

			//username = (username === null) ? results[0].username : username;
			//password = (password === null) ? results[0].password : password;
			//nickname = (nickname === null) ? results[0].nickname : nickname;
			//intro = (intro === null) ? results[0].intro : intro;
			//genre = (genre === null) ? results[0].genre : genre;
			//position = (position === null) ? results[0].position : position;

			connection.query(sql, [username, hashPassword, nickname, intro, genre, position, userId],
				function (err, results) {
					connection.release();
					if (err) {
						callback(err);
					} else {
						callback(null);
					}
				});
		}
	async.waterfall([getConnection, SelectUsername, SelectNickname, generateSalt, generateHashPassword, UpdateMember], function (err, result) {
		if (err) {
			next(err);
		} else {
			var data = {
				"message" : "회원 프로필 수정이 정상적으로 처리되었습니다.",
				"success" : result
			};
			res.json(data);
		}
	});
	} else {
		var err = new Error('SSL/TLS Upgrade Required');
		err.status = 426;
		next(err);
	}
});
// 16. 연동회원 트랙 상세목록 보기 (HTTP)
router.get('/:mid/tracks', function (req, res, next) {
	var user = {
		"soundId" : req.user.cloudId,
		"mid" : req.params.mid
	}

	function selectTracks(connection, callback) {
		var sql = "SELECT id, url " +
							"FROM matchdb.tracks " +
							"WHERE user_id = ?";
		connection.query(sql, [user], function (err, results) {
			connection.release();
			if (err) {
				callback(err)
			} else {
				callback(null, results);
			}
		})
	}
	async.waterfall([getConnection, selectTracks], function (err, result) {
		if (err) {
			next(err);
		} else {
			var data = {
				message : "연동정보(트랙) 불러오기 성공",
				success : result
			};
			res.json(data);
		}
	});
});
// 18. 내 트랙 상세목록 보기 (HTTP)
router.get('/me/tracks', function(req, res, next) {
	var user = {
		"cloudId": req.user.soundId,
		"id": req.user.id
	}

	function selectTracks(connection, callback) {
		var sql = "SELECT id, url " +
			"FROM matchdb.tracks " +
			"WHERE user_id = ?";
		connection.query(sql, [user], function (err, results) {
			connection.release();
			if (err) {
				callback(err)
			} else {
				callback(null, results);
			}
		})
	}
	async.waterfall([getConnection, selectTracks], function (err, result) {
		if (err) {
			next(err);
		} else {
			var data = {
				"success": {
					"message": "내 연동정보(트랙) 불러오기 성공",
					"data": result
				}
			};
			res.json(data);
		}
	});
});
// 19. 프로필사진 업로드
router.post('/me/photos', isLoggedIn, function(req, res, nex) {
	var userId = req.user.id;

	var form = new formidable.IncomingForm();
	form.uploadDir = path.join(__dirname, '../uploads');
	form.keepExtensions = true;
	form.multiples = true;

	form.parse(req, function (err, fields, files) {
		var results = [];

		var mimeType = mime.lookup(path.basename(files['photo'].path));
		var s3 = new AWS.S3({
			"accessKeyId": s3Config.key,
			"secretAccessKey": s3Config.secret,
			"region": s3Config.region,
			"params": {
				"Bucket": s3Config.bucket,
				"Key": s3Config.imageDir + "/" + path.basename(files['photo'].path), // 목적지의 이름
				"ACL": s3Config.imageACL,
				"ContentType": mimeType //mime.lookup
			}
		});

		function UploadServer(callback) {
			var body = fs.createReadStream(files['photo'].path);
			s3.upload({"Body": body})
				.on('httpUploadProgress', function (event) {
					console.log(event);
				})
				.send(function (err, data) {
					if (err) {
						console.log(err);
						callback(err);
					} else {
						console.log(data);
						results.push(data.Location);
						console.log('location 부분', data.Location);
						callback(null);
					}
				});
		}

		function deleteS3Photo(connection, callback) {
			var userId = req.user.id;
			var sql = "SELECT photo_path " +
				"FROM matchdb.user " +
				"WHERE id = ?";
			connection.query(sql, [userId], function (err, results) {
				console.log('userId', userId);
				if (err) {
					connection.release();
					callback(err);
				} else if (results.length === 0) {
					console.log("사진이 존재하지 않습니다.");
					callback(null, connection);
				} else {
					console.log('삭제할 파일명: ' + path.basename(results[0].photo_path));
					var s3 = new AWS.S3({
						"accessKeyId": s3Config.key,
						"secretAccessKey": s3Config.secret,
						"region": s3Config.region
					});
					var params = { //
						"Bucket": s3Config.bucket,
						"Key": s3Config.imageDir + "/" + path.basename(results[0].photo_path)
					};
					s3.deleteObject(params, function (err, data) {
						if (err) {
							connection.release();
							console.log(err, err.stack);
							callback(err);
						} else {
							console.log(data);
							callback(null, connection);
						}
					});

				}
			})
		}

		function updatePhoto(connection, callback) { //db에 있는 기존데이터를 s3통한 링크로 업데이트
			var sql = "UPDATE matchdb.user " +
				"SET photo_path= ? " +
				"WHERE id = ?";
			connection.query(sql, [results[0], userId], function (err, result) {
				console.log('UpdateServer.results[0]', results[0]);
				connection.release();
				if (err) {
					callback(err);
				} else {
					callback(null, {"id": result.Id});
					console.log('result.Id', result.Id)
				}
			})
		}
// 삭제후 업로드!!   선삭제 후업롣   왜냐면 삭제 에러시 못올리게하려고!!
		async.waterfall([UploadServer, getConnection, deleteS3Photo, updatePhoto], function (err, result) {
			if (err) {
				next(err);
			} else {
				var data = {
					"success" : {
						"message" : "프로필 사진이 업로드 되었습니다."
					}
				};
				res.json(data);
			}
		});

	});
});

//http://api.soundcloud.com/users/208610688/tracks?client_id=71968fd976cc5c0693a7d6b76ea05213
// 내꺼 user id 트랙정보 보는 api

module.exports = router;