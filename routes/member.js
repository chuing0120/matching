var express = require('express');
var async = require('async');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var mime = require('mime');
var path = require('path');
var s3Config = require('../config/s3Config');
var fs = require('fs');
var bcrypt = require('bcrypt');
var request = require('request');

var router = express.Router();

// 로그인되야지만 인증
function isLoggedIn(req, res, next) {
	if (!req.isAuthenticated()) {
		var err = new Error();
		err.message = "로그인이 필요합니다.";
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
router.post('/', function (req, res, next) {
	if (req.secure) {
		var username = req.body.username;
		var nickname = req.body.nickname;
		var password = req.body.password;

		function selectUsername(connection, callback) { // 아이디 중복검사
			var sql = "SELECT id " +
				"FROM matchdb.user " +
				"WHERE username = ?";
			connection.query(sql, [username], function (err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						connection.release();
						var err = new Error();
						err.message = '사용자가 이미 존재 하고있습니다.';
						err.status = 409;
						callback(err);
					} else {
						callback(null, connection);
					}
				}
			});
		}

		function selectNickname(connection, callback) { // 닉네임 중복검사
			var sql = "SELECT id " +
				"FROM matchdb.user " +
				"WHERE nickname = ?";
			connection.query(sql, [nickname], function (err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						connection.release();
						var err = new Error();
						err.message = '닉네임이 이미 존재하고 있습니다.';
						err.status = 409;
						callback(err);
					} else {
						callback(null, connection);
					}
				}
			});
		}

		function generateSalt(connection, callback) { // salt
			var rounds = 10;
			bcrypt.genSalt(rounds, function (err, salt) {
				if (err) {
					callback(err);
				} else {
					callback(null, salt, connection);
				}
			})
		}

		function generateHashPassword(salt, connection, callback) { //해쉬 암호화
			bcrypt.hash(password, salt, function (err, hashPassword) {
				if (err) {
					callback(err);
				} else {
					callback(null, hashPassword, connection);
				}
			});
		}

		function insertMember(hashPassword, connection, callback) {
			var sql = "INSERT INTO matchdb.user (username, nickname, password, photo_path) " +
				"VALUES (?, ?, ?, ?)";
			connection.query(sql, [username, nickname, hashPassword,
					"https://s3.ap-northeast-2.amazonaws.com/chuing/test/upload_d4e6dcbdfeaeecd0dc00839b61848a1b.png"],
				function (err, result) { // 위에 있는 링크는 프로필 기본 디폴트 사진
					connection.release();
					if (err) {
						callback(err);
					} else {
						callback(null, {"id": result.insertId});
					}
				})
		}

		async.waterfall([getConnection, selectUsername, selectNickname, generateSalt,
			generateHashPassword, insertMember], function (err, result) {
			if (err) {
				next(err);
			} else {
				var data = {
					"success": {
						"message": "가입이 정상적으로 처리되었습니다."
					}
				};
				res.json(data);
			}
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		err.status = 426;
		next(err);
	}
});

// 3. 내 프로필 조회 (HTTPS)
router.get('/me', isLoggedIn, function (req, res, next) {
	if (req.secure) { // HTTPS
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
					"success": {
						"message": "회원프로필 정보가 정상적으로 조회되었습니다",
						"data": result
					}
				};
				Logger.log('debug', result, 'sss');
				res.json(data);
			}
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		err.status = 426;
		next(err);
	}
});
// 4. 다른 프로필 보기 (HTTPS)
router.get('/:mid', function (req, res, next) {
	if (req.secure) {
		var user = {
			"id": req.user.id,
			"mid": req.params.mid
		};

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
				next(err);
			} else {
				var data = {
					"success": {
						"message": "회원프로필 정보가 정상적으로 조회되었습니다",
						"data": result
					}
				};
				res.json(data);
			}
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
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
			connection.query(sql, [username], function (err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						if (req.user.id !== results[0].id) { // 기존 아이디 중복검사
							var err = new Error();
							err.message = '아이디가 이미 존재하고 있습니다.';
							err.status = 409;
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
			connection.query(sql, [nickname], function (err, results) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					if (results.length) {
						if (req.user.id !== results[0].id) { // 기존 닉네임 중복검사
							var err = new Error();
							err.message = '닉네임이 이미 존재하고 있습니다.';
							err.status = 409;
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

		function generateSalt(connection, callback) { // salt
			var rounds = 10;
			bcrypt.genSalt(rounds, function (err, salt) {
				if (err) {
					callback(err);
				} else {
					callback(null, salt, connection);
				}
			});
		}

		function generateHashPassword(salt, connection, callback) { // 해쉬 암호화
			bcrypt.hash(password, salt, function (err, hashPassword) {
				if (err) {
					callback(err);
				} else {
					callback(null, hashPassword, connection);
				}
			});
		}

		function UpdateMember(hashPassword, connection, callback) { // Update문
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

		async.waterfall([getConnection, SelectUsername, SelectNickname, generateSalt,
			generateHashPassword, UpdateMember], function (err, result) {
			if (err) {
				next(err);
			} else {
				var data = {
					"success": {
						"message": "회원 프로필 수정이 정상적으로 처리되었습니다.",
						"data": result
					}
				};
				res.json(data);
			}
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		err.status = 426;
		next(err);
	}
});
// 18. 내 트랙 상세목록 보기 (HTTPS)
router.get('/me/tracks', function (req, res, next) {
	if (req.secure) {
		var userId = req.user.id;

		function selectMember(connection, callback) { // cloud_id를 results로
			var sql = "SELECT cloud_id " +
									"FROM matchdb.user " +
									"WHERE id = ?";
			connection.query(sql, [userId], function (err, results) {
				connection.release();
				if (err) {
					callback(err);
				} else {
					callback(null, connection, results);
				}
			});
		}

		function selectAPI(connection, results, callback) { // cloud_id를 조회하여 사클의 cloud_id를 조회할때
			request('http://api.sou ndcloud.com/users/' + results[0].cloud_id + '/tracks?client_id=71968fd976cc5c0693a7d6b76ea05213',
				function (error, response, body) {
					var body = JSON.parse(body); //json으로 파싱
					if (!error && response.statusCode == 200) {
						callback(null, body);
					} else {
						callback();
					}
				});
		}

		async.waterfall([getConnection, selectMember, selectAPI], function (err, results) {
			if (err) {
				next(err);
			} else {
				var data = {
					"success": {
						"message": "내 연동정보(트랙) 불러오기 성공되었습니다.",
						"data": results
					}
				};
			}
			res.json(data)
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		err.status = 426;
		next(err);
	}
});
// 16. 연동회원 트랙 상세목록 보기 (HTTPS)
router.get('/:mid/tracks', function (req, res, next) {
	if (req.secure) {
		var mid = req.params.mid;

		function selectMember(connection, callback) {
			var sql = "SELECT cloud_id " +
									"FROM matchdb.user " +
									"WHERE id = ?";
			connection.query(sql, [mid], function (err, results) {
				connection.release();
				if (err) {
					callback(err);
				} else {
					callback(null, connection, results);
				}
			});
		}

		// your function definition code is here and exe
		function selectAPI(connection, results, callback) {
			request('http://api.soundcloud.com/users/' + results[0].cloud_id + '/tracks?client_id=71968fd976cc5c0693a7d6b76ea05213',
				function (error, response, body) {
					var body = JSON.parse(body);

					if (!error && response.statusCode == 200) {
						callback(null, body);
					} else {
						callback();
					}
				});
		}

		async.waterfall([getConnection, selectMember, selectAPI], function (err, results) {
			if (err) {
				next(err);
			} else {
				var data = {
					"success": {
						"message": "연동정보(트랙) 불러오기 성공되었습니다.",
						"data": results
					}
				};
			}
			res.json(data)
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		err.status = 426;
		next(err);
	}
});

// 19. 프로필사진 업로드 (HTTPS)
router.post('/me/photos', isLoggedIn, function (req, res, next) {
	if (req.secure) {
		var userId = req.user.id;

		if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
			var url = {
				"message": "사진 파일은 헤더의 content-type을 form-data로 사용하세요."
			};
			res.json(url);
		} else {
			var form = new formidable.IncomingForm(); // 파일 업로드 (formidable)
			form.uploadDir = path.join(__dirname, '../uploads'); //uploads 폴더경로로
			form.keepExtensions = true; // 파일 확장자 남긴다에 true
			form.maxFieldsSize = 5 * 1024 * 1024; // 5MB 용량 제한 , 아무리 사진 하나가 5MB을 넘을리가..

			form.parse(req, function (err, fields, files) { // 폼을 파싱하는거같은데 보류
				var results = [];

				var mimeType = mime.lookup(path.basename(files['photo'].path)); //mime타입 대상은 photo네임
				var s3 = new AWS.S3({ //s3 config정보 로딩
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

				function UploadServer(callback) { // s3로 파일 업로드
					var body = fs.createReadStream(files['photo'].path);
					s3.upload({"Body": body}) //서버로 업로드
						.on('httpUploadProgress', function (event) {
						// event : loaded, part, key:jpg파일경로
						})
						.send(function (err, data) { // 파일 전송
							if (err) {
								callback(err);
							} else {
								fs.unlink(files['photo'].path, function () { // unlink(파일삭제) uploads에 기록이 안남음
									//uploads에 올라간 파일 삭데되었음..
								});
								results.push(data.Location); //data.Location에서 s3 올라간 파일경로 나옴
								callback(null);
							}
						});
				}

				function deleteS3Photo(connection, callback) { // s3에 있는 파일 지워보장
					var userId = req.user.id;

					var sql = "SELECT photo_path " +
										"FROM matchdb.user " +
										"WHERE id = ?";
					connection.query(sql, [userId], function (err, results) {
						if (err) {
							connection.release();
							callback(err);
						} else if (results.length === 0) {
							// 파일 존재 하지 않을때
							callback(null, connection);
						} else {
							//path.basename(results[0].photo_path : upload_xxx.png 파일나옴
							var s3 = new AWS.S3({
								"accessKeyId": s3Config.key,
								"secretAccessKey": s3Config.secret,
								"region": s3Config.region
							});
							var params = {
								"Bucket": s3Config.bucket,
								"Key": s3Config.imageDir + "/" + path.basename(results[0].photo_path)
							};
							s3.deleteObject(params, function (err, data) {
								if (err) {
									connection.release();
									callback(err);
								} else {
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
						// 현재 results[0] 값은 : s3에 올라간 파일경로나옴 data.Location값하고 일치
						connection.release();
						if (err) {
							callback(err);
						} else {
							callback(null, {"id": result.id});
						}
					})
				}

// 삭제후 업로드!!   선삭제 후업롣   왜냐면 삭제 에러시 못올리게하려고!!
				async.waterfall([UploadServer, getConnection, deleteS3Photo, updatePhoto], function (err, result) {
					if (err) {
						next(err);
					} else {
						var data = {
							"success": {
								"message": "프로필 사진이 업로드 되었습니다."
							}
						};
						res.json(data);
					}
				});
			});
		}
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		err.status = 426;
		next(err);
	}
});

//http://api.soundcloud.com/users/208610688/tracks?client_id=71968fd976cc5c0693a7d6b76ea05213

// 20. 트랙정보 동기화 = 기존정보 삭제 + 새로운 정보 인서트 = 트렌잭션 ㄱㄱ (HTTPS)
//router.post('/', isLoggedIn, function (req, res, next) {
//	var userId = req.user.id;
//	var track = req.body.track;
//	if (req.secure) {
//		function synchronization(connection, callback) {
//			connection.beginTransaction(function (err) {
//				if (err) {
//					connection.release();
//					callback(err);
//				} else {
//					function deleteTrack(callback) {
//						if (err) {
//							connection.release();
//							callback(err);
//						} else {
//							var sql = "DELETE FROM matchdb.tracks " +
//								"WHERE user_id = ?";
//							connection.query(sql, [userId], function (err, results) {
//								if (err) {
//									console.log('delete 에러');
//									connection.release();
//									callback(err);
//								} else {
//									console.log('삭제될 트랙', results);
//									callback(null);
//								}
//							});
//						}
//					}
//
//					function insertTrack(callback) {
//						if (err) {
//							connection.release();
//							callback(err);
//						} else {
//							var sql = "INSERT INTO matchdb.tracks (url, user_id) " +
//								"VALUES (?, ?)";
//							connection.query(sql, [track, userId], function (err, results) {
//								console.log('results', results);
//								if (err) {
//									console.log('insert 에러');
//									connection.rollback();
//									connection.release();
//									callback(err);
//								} else {
//									connection.commit();
//									connection.release();
//									console.log('추가될 트랙', results);
//									callback(null);
//								}
//							});
//						}
//					}
//
//					async.series([deleteTrack, insertTrack], function (err, result) {
//						if (err) {
//							callback(err);
//						} else {
//							callback(null, result);
//						}
//					});
//
//				}
//			});
//		}
//
//		async.waterfall([getConnection, synchronization], function (err, results) {
//			if (err) {
//				err.message = "트랙 동기화 실패";
//				next(err);
//			} else {
//				var data = {
//					"success": {
//						"message": "트랙 동기화 성공"
//					}
//				};
//				res.json(data);
//			}
//		})
//	} else {
//		var err = new Error('SSL/TLS Upgrade Required');
//		err.status = 426;
//		next(err);
//	}
//});

module.exports = router;