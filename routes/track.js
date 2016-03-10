var express = require('express');
var async = require('async');

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

// 20. 트랙정보 동기화 = 기존정보 삭제 + 새로운 정보 인서트 = 트렌잭션 ㄱㄱ (HTTPS)
router.post('/', isLoggedIn, function (req, res, next) {
	var userId = req.user.id;
	var track = req.body.track;
	if (req.secure) {
		function synchronization(connection, callback) {
			connection.beginTransaction(function (err) {
				if (err) {
					connection.release();
					callback(err);
				} else {
					function deleteTrack(callback) {
						if (err) {
							connection.release();
							callback(err);
						} else {
							var sql = "DELETE FROM matchdb.tracks " +
								"WHERE user_id = ?";
							connection.query(sql, [userId], function (err, results) {
								if (err) {
									console.log('delete 에러');
									connection.release();
									callback(err);
								} else {
									console.log('삭제될 트랙', results);
									callback(null);
								}
							});
						}
					}

					function insertTrack(callback) {
						if (err) {
							connection.release();
							callback(err);
						} else {
							var sql = "INSERT INTO matchdb.tracks (url, user_id) " +
								"VALUES (?, ?)";
							connection.query(sql, [track, userId], function (err, results) {
								console.log('results', results);
								if (err) {
									console.log('insert 에러');
									connection.rollback();
									connection.release();
									callback(err);
								} else {
									connection.commit();
									connection.release();
									console.log('추가될 트랙', results);
									callback(null);
								}
							});
						}
					}

					async.series([deleteTrack, insertTrack], function (err, result) {
						if (err) {
							callback(err);
						} else {
							callback(null, result);
						}
					});

				}
			});
		}

		async.waterfall([getConnection, synchronization], function (err, results) {
			if (err) {
				err.message = "트랙 동기화 실패";
				next(err);
			} else {
				var data = {
					"success": {
						"message": "트랙 동기화 성공"
					}
				};
				res.json(data);
			}
		})
	} else {
		var err = new Error('SSL/TLS Upgrade Required');
		err.status = 426;
		next(err);
	}
});


module.exports = router;