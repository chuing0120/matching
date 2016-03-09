var express = require('express');
var router = express.Router();
var formidable = require('formidable');
var AWS = require('aws-sdk');
var mime = require('mime');
var path = require('path');
var s3Config = require('../config/s3Config');
var async = require('async');
var fs = require('fs');

// 로그인되야지만 파일첨부 가능
function isLoggedIn(req, res, next) {
  if (!req.isAuthenticated()) {
    var err = new Error('로그인이 필요합니다...');
    err.status = 401;
    next(err);
  } else {
    next();
  }
}

// get connection 전역
function getConnection(callback) {
  pool.getConnection(function(err, connection) {
    if (err) {
      callback(err);
    } else {
      callback(null, connection);
    }
  });
}

// photos?=파일명  , 1개 or 2개이상 파일
router.post('/', isLoggedIn, function(req, res, next) {
  var userId = req.user.id;

  var form = new formidable.IncomingForm();
  form.uploadDir = path.join(__dirname, '../uploads');
  form.keepExtensions = true;
  form.multiples = true;

  form.parse(req, function(err, fields, files) {
    var results = [];
    if (files['photo'] instanceof Array) { // 사진을 여러 개 업로드 할 경우 async.each() ...
    //if (files['photo'][1] !== undefined) { // 사진을 여러 개 업로드 할 경우 async.each() ...
      async.each(files['photo'], function(file, cb) {
        var mimeType = mime.lookup(path.basename(file.path));
        var s3 = new AWS.S3({
          "accessKeyId" : s3Config.key,
          "secretAccessKey" : s3Config.secret,
          "region" : s3Config.region,
          "params" : {
            "Bucket": s3Config.bucket,
            "Key": s3Config.imageDir + "/" + path.basename(file.path), // 목적지의 이름
            "ACL": s3Config.imageACL,
            "ContentType": mimeType //mime.lookup
          }
        });
        var body = fs.createReadStream(file.path);
        s3.upload({ "Body": body })
          .on('httpUploadProgress', function(event) {
            console.log(event);
          })
          .send(function(err, data) {
            if (err) {
              console.log(err);
              cb(err);
            } else {
              console.log(data);
              results.push({ "s3URL": data.Location }); // 링크데이터
              cb();
            }
          });
      }, function(err) {
        if (err) {
          callback(err);
        } else {
          function updatePhoto(connection, callback) { //
            var sql = "UPDATE matchdb.user " +
                      "SET photo_path= ? " +
                      "WHERE id = ?";
            connection.query(sql, [results[0].s3URL, userId], function (err, result) {
              connection.release();
              if (err) {
                callback(err);
              } else {
                callback(null, {
                  "id": result.Id
                });
              }
            })
          }
          //})
          async.waterfall([getConnection, updatePhoto],function(err, result) {
            if (err) {
              next(err);
            } else {
              results.message = "파일 업로드 완료";
              res.json(results);
            }
          });
        }
      });
    } else if (!files['photo']) { // 사진을 올리지 않은 경우

    } else { // 기타 (사진을 하나 올렸을 경우)
      var s3 = new AWS.S3({
        "accessKeyId" : s3Config.key,
        "secretAccessKey" : s3Config.secret,
        "region" : s3Config.region,
        "params" : {
          "Bucket": s3Config.bucket,
          "Key": s3Config.imageDir + "/" + path.basename(files['photo'].path), // 목적지의 이름
          "ACL": s3Config.imageACL,
          "ContentType": "image/jpeg" //mime.lookup
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
              callback(null);
            }
          });
      }
      function updatePhoto(connection, callback) {
        var sql = "UPDATE matchdb.user " +
          "SET photo_path= ? " +
          "WHERE id = ?";
        connection.query(sql, [results[0], userId], function (err, result) {
          connection.release();
          if (err) {
            callback(err);
          } else {
            callback(null, { "id": result.Id });
          }
        })
      }
      //})
      async.waterfall([UploadServer, getConnection, updatePhoto],function(err, result) {
        if (err) {
          next(err);
        } else {
          result.message = "파일 업로드 완료";
          res.json(result);
        }
      });
    }
  });
});

module.exports = router;
