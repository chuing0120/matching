var express = require('express');
var async = require('async');
var passport = require('passport');

var router = express.Router();

// 2. 로컬 로그인 (HTTPS)
router.post('/login', function (req, res, next) {
	if (req.secure) {
		passport.authenticate('local-login', function (err, user, info) {
			if (err) {
				next(err);
			} else if (!user) {
				var err = new Error();
				err.message = '비밀번호를 다시 확인하세요.';
				next(err);
			} else {
				req.logIn(user, function (err) {
					if (err) {
						//console.log(err);
						next(err);
					} else {
						var result = {
							"success": {
								"message": "로그인이 되었습니다",
								"id": user.id
							}
						};
						res.json(result);
					}
				});
			}
		})(req, res, next);
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		next(err);
	}
});
// 18. 로그아웃 (HTTPS)
router.get('/logout', function (req, res, next) {
	if (req.secure) {
		req.logout();
		res.json({
			"success": {
				"message": "로그아웃 되었습니다..."
			}
		});
	} else {
		var err = new Error();
		err.message = "SSL/TLS Upgrade Required";
		next(err);
	}
});
// 15. 연동로그인 (HTTP)
router.get('/soundcloud', passport.authenticate('soundcloud-token'));
router.get('/soundcloud', function (req, res, next) {
	passport.authenticate('soundcloud-token', function (err, user, info) {
		if (err) {
			next(err);
		} else {
			req.logIn(user, function (err) {
				if (err) {
					next(err);
				} else {
					var result = {
						"success": {
							"message": "사운드클라우드 연동로그인이 되었습니다.",
							"data": user.cloudId
						}
					};
					res.json(result);
					//res.json(user);
				}
			});
		}
	})(req, res, next);
});

module.exports = router;
