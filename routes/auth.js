var express = require('express');
var async = require('async');
var bcrypt = require('bcrypt');
var passport = require('passport');

var router = express.Router();

// 2. 로컬 로그인 (HTTPS)
router.post('/login', function(req, res, next) {
    if (req.secure) {
        passport.authenticate('local-login', function(err, user, info) {
            if (err) {
                next(err);
            } else if (!user) {
                var err = new Error('비밀번호를 다시 확인하세요.');
                err.status = 401;
                next(err);
            } else {
                req.logIn(user, function(err) {
                    if (err) {
                        console.log(err);
                        next(err);
                    } else {
                        var result = {
                            "success": {
                                "message": "로그인이 되었습니다"
                            }
                        };
                        res.json(result);
                    }
                });
            }
        })(req, res, next);
    } else {
        var err = new Error('SSL/TLS Upgrade Required');
        err.status = 426;
        next(err);
    }
});
// 18. 로그아웃
router.post('/logout', function(req, res, next) {
    req.logout();
    res.json({
        "sucess": "로그아웃 되었습니다..."
    });
});
// 15. 연동로그인 (HTTPS)
router.get('/soundcloud',  passport.authenticate('soundcloud'));
router.get('/soundcloud/callback',function(req, res, next) {
    passport.authenticate('soundcloud',{ failureRedirect: '/login' },
    function(err, user, info) {
        if (err) {
            next(err);
        } else {
            req.logIn(user, function(err) {
                if (err) {
                    console.log(err);
                    next(err);
                } else {
                    var result = {
                        "success": {
                            "message": "연동로그인이 되었습니다."
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
