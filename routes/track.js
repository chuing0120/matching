var express = require('express');
var async = require('async');
var bcrypt = require('bcrypt');

var router = express.Router();

// 16. 연동회원 트랙 상세목록 보기
router.get('/', function (req, res, next) {
    var result = {
        "success": {
            "message": "연동정보(트랙) 불러오기 성공",
            "page": req.query.page,
            "pageLimit": 10,
            "tracks": [
                {"url": "연동트랙 링크주소"}
            ]
        }
    };





    res.json(result);
});

module.exports = router;