var LocalStrategy = require('passport-local').Strategy;
var SoundCloudStrategy = require('passport-soundcloud').Strategy;
var bcrypt = require('bcrypt');
var async = require('async');
var authconfig = require('./authconfig');

module.exports = function (passport) {

	passport.serializeUser(function (user, done) {
		done(null, user.id);
	});

	passport.deserializeUser(function (id, done) {
		pool.getConnection(function (err, connection) {
			if (err) {
				done(err);
			} else {
				var sql = "SELECT id, username, nickname, cloud_id, cloud_token " +
					"FROM matchdb.user " +
					"WHERE id = ?";
				connection.query(sql, [id], function (err, results) {
					connection.release();
					if (err) {
						done(err);
					} else {
						var user = {
							"id": results[0].id,
							"cloudId": results[0].cloud_id,
							"username": results[0].username,
							"nickname": results[0].nickname
						};
						done(null, user);
					}
				});
			}
		});
	});

	// 2. 로컬 로그인 (HTTPS)
	passport.use('local-login', new LocalStrategy({
		usernameField: "username",
		passwordField: "password",
		passReqToCallback: true
	},
		function (req, username, password, done) { // new LocalStrategy를 local-login로 정책한다.
		function getConnection(callback) {
			pool.getConnection(function (err, connection) {
				if (err) {
					callback(err);
				} else {
					callback(null, connection);
				}
			});
		}

		function selectUser(connection, callback) {
			var sql = "SELECT id, username, password " +
				"FROM matchdb.user " +
				"WHERE username = ?";
			connection.query(sql, [username], function (err, results) {
				connection.release();
				if (err) {
					callback(err);
				} else {
					if (results.length === 0) {
						var err = new Error('아이디를 다시 확인하세요.');
						err.status = 409;
						callback(err);
					} else {
						var user = {
							"id": results[0].id,
							"hashPassword": results[0].password
						};
						callback(null, user);
					}
				}
			});
		}

		function compareUserInput(user, callback) {
			bcrypt.compare(password, user.hashPassword, function (err, result) {
				if (err) {
					callback(err);
				} else {
					if (result) {
						callback(null, user);
					} else {
						callback(null, false);
					}
				}
			});
		}

		async.waterfall([getConnection, selectUser, compareUserInput], function (err, user) {
			if (err) {
				done(err);
			} else {
				delete user.hashPassword;
				done(null, user);
			}
		});
	}));
	//15. 연동로그인 (HTTP)
	passport.use('soundcloud', new SoundCloudStrategy({
		"clientID": authconfig.soundcloud.appId,
		"clientSecret": authconfig.soundcloud.appSecret,
		"callbackURL": authconfig.soundcloud.callbackURL,
		"passReqToCallback": true
	},
		function (req, accessToken, refreshToken, profile, done) {
			console.log('profile 정보',profile);
			function getConnection(callback) {
				pool.getConnection(function (err, connection) {
					if (err) {
						callback(err);
					} else {
						callback(null, connection);
					}
				});
			}
			function selectOrCreateUser(connection, callback) {
				var sql = "SELECT id, cloud_id " +
					"FROM matchdb.user " +
					"WHERE cloud_id = ?";
				connection.query(sql, [profile.id], function (err, results) {
					if (err) {
						connection.release();
						callback(err);
					} else {
						if (results.length === 0) { //사용자가 존재 하지않을때 insert 기능일어남
							var insert = "INSERT INTO matchdb.user (cloud_id, cloud_token, nickname, photo_path) " +
														"VALUES (?, ?, ?, ?)";
							connection.query(insert, [profile.id, accessToken, profile._json.username, profile._json.avatar_url], function (err, result) {
																		//클라우드아이디,    토큰,          유저네임,                 썸네일사진
								connection.release();
								if (err) {
									callback(err);
								} else {
									var user = {
										"id": result.insertId,
										"cloudId": profile.id,
										"cloudUsername": profile.username
									};
									callback(null, user);
								}
							});
						} else {
							if (accessToken === results[0].cloud_token) {
								connection.release();
								var user = {
									"id": results[0].id,
									"cloudId": results[0].cloud_id,
									"cloudUsername": profile.username
								};
								callback(null, user);
							} else {
								var update = "UPDATE matchdb.user " +
															"SET cloud_token = ? " +
															"WHERE cloud_id = ?";
								connection.query(update, [accessToken, profile.id], function (err, result) {
									connection.release();
									if (err) {
										callback(err);
									} else {
										var user = {
											"id": results[0].id,
											"cloudId": profile.id
										};
										callback(null, user);
									}
								});
							}
						}
					}
				});
			}
			async.waterfall([getConnection, selectOrCreateUser], function (err, user) {
				if (err) {
					done(err);
				} else {
					done(null, user);
				}
			});
	}));
};