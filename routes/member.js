var express = require('express');
var async = require('async');
var bcrypt = require('bcrypt');
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

// 1. 회원가입 (HTTPS)
router.post('/', function(req, res, next) {
	if (req.secure) {
		var username = req.body.username;
		var nickname = req.body.nickname;
		var password = req.body.password;

		function getConnection(callback) {
			pool.getConnection(function (err, connection) {
				if (err) {
					callback(err);
				} else {
					callback(null, connection);
				}
			});
		}
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

		function getConnection(callback) {
			pool.getConnection(function (err, connection) {
				if (err) {
					callback(err);
				} else {
					callback(null, connection);
				}
			});
		}
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
				"message" : "회원프로필 정보가 정상적으로 조회되었습니다",
				"success" : result
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
// 4. 다른 프로필 보기 (HTTPS)
router.get('/:mid', function(req, res, next) {
	if (req.secure) {
		var user = {
			"id": req.user.id,
			"mid": req.params.mid
		}
		function getConnection(callback) {
			pool.getConnection(function (err, connection) {
				if (err) {
					callback(err);
				} else {
					callback(null, connection);
				}
			});
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

		function getConnection(callback) {
			pool.getConnection(function (err, connection) {
				if (err) {
					callback(err);
				} else {
					callback(null, connection);
				}
			});
		}
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

module.exports = router;