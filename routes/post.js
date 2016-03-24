var express = require('express');
var formidable = require('formidable');
var AWS = require('aws-sdk');
var mime = require('mime');
var path = require('path');
var s3Config = require('../config/s3Config');
var async = require('async');
var fs = require('fs');
var util = require('util');
var logger = require('../config/logging');

var router = express.Router();

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

// 6. 매칭/스토리 쓰기 (HTTP)
router.post('/', isLoggedIn, function (req, res, next) {

  function getConnection(callback) {
    pool.getConnection(function (err, conn) {
      if (err) {
        callback(err);
      } else {
        callback(null, conn);//..........
      }
    });
  }

  var insertId;
  var interest = [];  // + parseInt() !!!
  var userId = req.user.id;
  if (req.headers['content-type'] === 'application/x-www-form-urlencoded') { // 파일없이 저장할 때
    var user = {
      "id": userId,
      "title": req.body.title,
      "content": req.body.content,
      "limit": req.body.limit,  //  언디파인이면 게시글
      "decide": req.body.decide, //  값 존재 = 매칭!!
      "genre": req.body.genre,  // 장르 받아옴
      "position": req.body.position, // 포지션받아옴
    };

    if (typeof user.genre === 'string') {
      user.genre = user.genre.split(',');
    }
    if (typeof user.position === 'string') {
      user.position = user.position.split(',');
    }

    function parseGenrePosition(callback) {
      var i = 0;

      function each1(cb1) {
        async.eachSeries(user.genre, function (item, cb) {
          interest.push([item]);
          //interest.push({"genre": item});
          cb();
        }, function (err) {
          if (err) {
            callback(err);
          }
          cb1();
        });
      }

      function each2(cb2) {
        var i = 0;
        async.eachSeries(user.position, function (item, cb) {
          interest[i++].push(item);
          cb();
        }, function (err) {
          if (err) {
            callback(err);
          }
          cb2();
        });
      }

      async.series([each1, each2], function (err, results) {
        if (err) {
          callback(err);
        } else {

          callback(null);
        }
      });

    }

    function insertPost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
      var sql = "insert into matchdb.post (user_id, content) " +
        "    values ( ?, ?)";        //1=user.id
      connection.query(sql, [user.id, user.content], function (err, results) {
        connection.release();
        if (err) {
          callback(err);
        } else {    //어디서 봤던 코드..?
          callback(null);
        }
      });
    }

    function insertPostInterest(connection, callback) {
      connection.beginTransaction(function (err) {  //오 롤백된듯? 엥 아닌가??
        if (err) {
          connection.release();
          callback(err);
        } else {

          function insertMatch(callback) {
            var sql = "INSERT into matchdb.post (user_id, content, limit_people, decide_people) " +
              "VALUES ( ?, ?, ?, ?)";
            connection.query(sql, [user.id, user.content,
              user.limit, user.decide], function (err, result) {
              if (err) {
                connection.rollback();
                connection.release();
                callback(err);
              } else {    //어디서 봤던 코드..?
                insertId = result.insertId;
                callback(null);//, connection);
              }
            });
          }

          function insertInterests(callback) {
            var sql = "insert into matchdb.interest (post_id, genre, position) " +
              "    values ( ?, ?, ?)";
            async.each(interest, function (item, callback) {
              connection.query(sql, [insertId, item[0], item[1]], function (err, results) {
                if (err) {
                  callback(err);    //가장 가까운 콜백잼?
                } else {    //어디서 봤던 코드..?
                  callback(null);
                }
              });
            }, function (err) {
              if (err) {
                connection.rollback();
                connection.release();
                callback(err);
              } else {
                connection.commit();
                connection.release();
                callback(null);
              }
            });

          }

          async.series([parseGenrePosition, getConnection, insertMatch, insertInterests], function (err, results) {
            if (err) {
              callback(err);
            } else {
              callback(null);
            }
          });


        }
      })
    }

    //1개만 왔을경우? 리밋=3 디사=언디 = 0으로..   리밋?? 디사 3 ==??? 매칭?
    // 리밋이 1보다 작은경우...=매칭..?
    // 숫자가 아닐경우........ NaN!!!??
    // 리밋보다 디사가 클경우...........

    if (user.limit === undefined || user.limit === 0) { //됨
      async.waterfall([getConnection, insertPost], function (err, result) {
        if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
          var err = {
            "message": "body로 게시글 작성이 실패했습니다."
          };
          Logger.log('error', '/posts (POST)', err.message);
          next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
        } else {    //동적 프로퍼티 생성?!?!
          var result = {
            "success": {
              "message": "body로 게시글이 작성되었습니다.",
              //"userInput": user
            }
          };
          Logger.log('warn', '/posts (POST)', result.success.message);
          res.json(result);        //더미!!!!응답!!!!!!
        }
      });
    } else {
      async.waterfall([getConnection, insertPostInterest], function (err, result) {
        if (err) {
          var err = {
            "message": "body로 매칭글 작성이 실패했습니다."
          };
          Logger.log('error', '/posts (POST)', err.message);
          next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
        } else {    //동적 프로퍼티 생성?!?!
          var result = {
            "success": {
              "message": "body로 매칭게시글이 작성되었습니다."
              //"userInput": user
            }
          };
          Logger.log('warn', '/posts (POST)', result.success.message);
          res.json(result);        //더미!!!!응답!!!!!!
        }
      });
    }

  } else { // 파일을 포함한  때 ('multipart/form-data; boundary=----...')
    var form = new formidable.IncomingForm();
    form.uploadDir = path.join(__dirname, '../uploads');
    form.keepExtensions = true;
    form.multiples = true;
    form.maxFieldsSize = 30 * 1024 * 1024;      // 30MB !!

    var formFields = {};
    form.on('field', function(name, value) {
      function makeFormFields(prop, val) {
        if (!formFields[prop]) {
          formFields[prop] = val;
        } else {
          if (formFields[prop] instanceof Array) { // 배열일 경우
            formFields[prop].push(val);
          } else { // 배열이 아닐 경우
            var tmp = formFields[prop];
            formFields[prop] = [];
            formFields[prop].push(tmp);
            formFields[prop].push(val);
          }
        }//
      }
      var re1 = /\[\]/;
      var re2 = /\[\d+\]/;
      if (name.match(re1)) {
        name = name.replace(re1, '');
      } else if (name.match(/\[\d+\]/)) {
        name = name.replace(re2, '');
      }
      makeFormFields(name, value);
    });

    form.parse(req, function (err, fields, files) {
      var results = [];


      var user = {
        "id": req.user.id,
        "title": fields.title,
        "content": fields.content,
        "limit": fields.limit_people,  //  언디파인이면 게시글
        "decide": fields.decide_people, //  값 존재 = 매칭!!
        "genre": fields.genre,  // 장르 받아옴
        "position": fields.position, // 포지션받아옴
      };
      logger.log('debug', 'fields => ', util.inspect(fields));

      logger.log('debug', 'user => ', util.inspect(user));

      function deleteS3Links() {
        async.each(results, function (item, cb) {
          var s3 = new AWS.S3({
            "accessKeyId": s3Config.key,
            "secretAccessKey": s3Config.secret,
            "region": s3Config.region
          });
          var params = {
            "Bucket": s3Config.bucket,       // 목적지의 이름
            "Key": s3Config.imageDir + "/" + path.basename(item.s3URL)
          };

          s3.deleteObject(params, function (err, data) {
            if (err) {
              //console.log(err, err.stack);//실패시 로깅...
              Logger.log('debug', '/posts (POST)', results);
            }
          });
        }, function (err) {
          if (err) {
            callback(err);//로깅? ㅜㅜ
          } else {
            callback(err);
          }
        });
      }

      function parseGenrePosition(callback) {

        var i = 0;

        function each1(cb1) {
          async.eachSeries(user.genre, function (item, cb) {
            interest.push([item]);
            //interest.push({"genre": item});
            cb();
          }, function (err) {
            if (err) {

              callback(err);
            }
            cb1();
          });
        };

        function each2(cb2) {
          var i = 0;
          async.eachSeries(user.position, function (item, cb) {
            interest[i++].push(item);
            cb();
          }, function (err) {
            if (err) {
              callback(err);
            }
            cb2();
          });
        }

        async.series([each1, each2], function (err, results) {
          if (err) {
            callback(err);
          } else {

            callback(null);
          }
        });

      }

      var user = {
        "id": userId,
        "title": fields.title,
        "content": fields.content,
        "limit": fields.limit,  //  언디파인이면 게시글
        "decide": fields.decide, //  값 존재 = 매칭!!
        "genre": formFields.genre,  // 장르 받아옴
        "position": formFields.position // 포지션받아옴
      };

      if (typeof user.genre === 'string') {
        user.genre = user.genre.split(',');
      }
      if (typeof user.position === 'string') {
        user.position = user.position.split(',');
      }

      if (files['photo'] instanceof Array) { // 사진을 여러 개 업로드 할 경우 async.each() ...
        async.each(files['photo'], function (file, cb) {
          var mimeType = mime.lookup(path.basename(file.path));
          var s3 = new AWS.S3({
            "accessKeyId": s3Config.key,
            "secretAccessKey": s3Config.secret,
            "region": s3Config.region,
            "params": {
              "Bucket": s3Config.bucket,
              "Key": s3Config.imageDir + "/" + path.basename(file.path), // 목적지의 이름
              "ACL": s3Config.imageACL,
              "ContentType": mimeType //mime.lookup
            }
          });
          var body = fs.createReadStream(file.path);
          s3.upload({"Body": body})
            .on('httpUploadProgress', function (event) {
              //console.log(event);
            })
            .send(function (err, data) {
              if (err) {
                var err = new Error();
                err.message = "업로드s에 실패하셨습니다."
                Logger.log('warn', '/posts (POST)', err);
                cb(err);
              } else {
                fs.unlink(file.path, function () {
                  //console.log(file.path + " 파일이 삭제되었습니다...");
                });
                results.push({"s3URL": data.Location}); // 링크데이터
                cb();
              }
            });
        }, function (err) {
          if (err) {
            callback(err);
          } else {

            function transPostLinks(connection, callback) {
              connection.beginTransaction(function (err) {
                if (err) {
                  connection.release();
                  callback(err);
                } else {

                  var insertPostId;

                  function insertPost(callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
                    var sql = "insert into matchdb.post (user_id, content)" +
                      "values ( ?, ?)";        //1=user.id
                    connection.query(sql, [user.id, user.content], function (err, result) {
                      if (err) {
                        connection.rollback();
                        connection.release();
                        callback(err);
                      } else {    //어디서 봤던 코드..?
                        insertPostId = result.insertId;
                        callback(null);
                      }
                    });
                  }

                  var insertResults = [];//new link id
                  function insertNewLinks(callback) {
                    var sql = "INSERT INTO matchdb.file (post_id, path) " +
                      "VALUES ( ? , ? )";
                    async.each(results, function (item, callback) {

                      connection.query(sql, [insertPostId, item.s3URL], function (err, result) {
                        if (err) {
                          var s3 = new AWS.S3({
                            "accessKeyId": s3Config.key,
                            "secretAccessKey": s3Config.secret,
                            "region": s3Config.region
                          });
                          var params = {
                            "Bucket": s3Config.bucket,       // 목적지의 이름
                            "Key": s3Config.imageDir + "/" + path.basename(item.s3URL)
                          };

                          s3.deleteObject(params, function (err, data) {
                            if (err) {
                              //console.log(err, err.stack);//실패시 로깅...
                              Logger.log('debug', '/posts (POST)', err);
                            }
                          });
                          callback(err);
                        } else {
                          insertResults.push(result.insertId);
                          callback(null);
                        }
                      });
                    }, function (err) {
                      if (err) {
                        connection.rollback();
                        connection.release();
                        callback(err);
                      } else {
                        connection.commit();
                        connection.release();
                        callback(null);
                      }
                    });
                  }

                  async.series([insertPost, insertNewLinks], function (err) {
                    if (err) {
                      callback(err);  //already release
                    } else {
                      callback(null);
                    }
                  });
                }
              });

            }

            function transPostLinksInterests(connection, callback) {
              connection.beginTransaction(function (err) {
                if (err) {
                  connection.release();
                  callback(err);
                } else {

                  var insertPostId;

                  function insertPost(callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
                    var sql = "insert into matchdb.post (user_id, content, limit_people, decide_people)" +
                      "values (?, ?, ?, ?)";        //1=user.id
                    connection.query(sql, [user.id, user.content, user.limit, user.decide], function (err, result) {
                      if (err) {
                        connection.rollback();
                        connection.release();
                        callback(err);
                      } else {    //어디서 봤던 코드..?
                        insertPostId = result.insertId;
                        callback(null);
                      }
                    });
                  }

                  var insertResults = [];//new link id
                  function insertNewLinks(callback) {
                    var sql = "INSERT INTO matchdb.file (post_id, path) " +
                      "VALUES ( ? , ? )";
                    async.each(results, function (item, callback) {

                      connection.query(sql, [insertPostId, item.s3URL], function (err, result) {
                        if (err) {
                          callback(err);
                        } else {
                          insertResults.push(result.insertId);
                          callback(null);
                        }
                      });
                    }, function (err) {
                      if (err) {
                        connection.rollback();
                        connection.release();
                        callback(err);
                      } else {
                        callback(null);
                      }
                    });
                  }

                  var interest = [];

                  function parseGenrePosition(callback) {
                    var i = 0;

                    function each1(cb1) {
                      async.eachSeries(user.genre, function (item, cb) {
                        interest.push([item]);
                        cb(null);
                      }, function (err) {
                        if (err) {
                          callback(err);
                        }
                        cb1(null);
                      });
                    }

                    function each2(cb2) {
                      var i = 0;
                      async.eachSeries(user.position, function (item, cb) {
                        interest[i++].push(item);
                        cb(null);
                      }, function (err) {
                        if (err) {
                          callback(err);
                        }
                        cb2(null);
                      });
                    }

                    async.series([each1, each2], function (err, results) {
                      if (err) {
                        callback(err);
                      } else {
                        callback(null);
                      }
                    });

                  }

                  function insertInterests(callback) {

                    var sql = "insert into matchdb.interest (post_id, genre, position) " +
                      "    values ( ?, ?, ?)";
                    async.each(interest, function (item, callback) {
                      connection.query(sql, [insertPostId, item[0], item[1]], function (err, results) {
                        if (err) {
                          connection.rollback();
                          connection.release();
                          callback(err);    //가장 가까운 콜백잼?
                        } else {    //어디서 봤던 코드..?
                          callback(null);
                        }
                      });
                    }, function (err) {
                      if (err) {
                        callback(err);
                      } else {
                        connection.commit();
                        connection.release();
                        callback(null);
                      }
                    });

                  }

                  async.series([insertPost, insertNewLinks, parseGenrePosition, insertInterests], function (err) {
                    if (err) {
                      callback(err);  //already release
                    } else {
                      callback(null);
                    }
                  });
                }
              });


            }


            if (user.limit === undefined || user.limit === 0) { //됨
              async.waterfall([getConnection, transPostLinks], function (err, result) {
                if (err) {
                  deleteS3Links();
                  var err = {
                    "message": "파일 업로드s 게시글 작성이 실패했습니다."
                  };
                  Logger.log('error', '/posts (POST)', err.message);
                  next(err);
                } else {
                  var result = {
                    "success": {
                      "message": "파일 업로드s 게시 완료"
                    }
                  };
                  Logger.log('warn', '/posts (POST)', result.success.message);
                  res.json(result);
                }
              });
            } else {
              async.waterfall([getConnection, transPostLinksInterests], function (err, result) {
                if (err) {
                  deleteS3Links();
                  var err = {
                    "message": "파일 업로드s 매칭글 작성이 실패했습니다."
                  };
                  Logger.log('error', '/posts (POST)', err.message);
                  next(err);
                } else {
                  var result = {
                    "success": {
                      "message": "파일 업로드s 매칭 완료"
                    }
                  };
                  Logger.log('warn', '/posts (POST)', result.success.message);
                  res.json(result);
                }
              });
            }
          }
        });
      } else if (!files['photo']) { // 사진을 올리지 않은 경우

        //전역으로 주면 없다고 에러남 ㅜㅜ

        function insertPost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
          var sql = "insert into matchdb.post (user_id, content) " +
            "    values ( ?, ?)";        //1=user.id
          connection.query(sql, [user.id, user.content], function (err, results) {
            connection.release();
            if (err) {
              callback(err);
            } else {    //어디서 봤던 코드..?
              callback(null);
            }
          });
        }

        function insertPostInterest(connection, callback) {
          connection.beginTransaction(function (err) {  //오 롤백된듯? 엥 아닌가??
            if (err) {
              connection.release();
              callback(err);
            } else {

              function insertMatch(callback) {
                var sql = "INSERT into matchdb.post (user_id, content, limit_people, decide_people) " +
                  "VALUES ( ?, ?, ?, ?)";
                connection.query(sql, [user.id, user.content,
                  user.limit, user.decide], function (err, result) {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {    //어디서 봤던 코드..?
                    insertId = result.insertId;
                    callback(null);//, connection);
                  }
                });
              }

// todo 개수 다를때 라든지.. ㅜㅜ  언디파인(=공백=낫널..)이면 널로 넣어야할듯?
              function insertInterests(callback) {
// sql: 'insert into matchdb.interest (post_id, genre, position)     values ( 79, \'0\'  ~ 1 2 , NULL)' }
                //왜 널이여..
                var sql = "insert into matchdb.interest (post_id, genre, position) " +
                  "    values ( ?, ?, ?)";

                async.each(interest, function (item, callback) {
                  connection.query(sql, [insertId, item[0], item[1]], function (err, results) {
                    if (err) {
                      callback(err);    //가장 가까운 콜백잼?
                    } else {    //어디서 봤던 코드..?
                      callback(null);
                    }
                  });
                }, function (err) {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {
                    connection.commit();
                    connection.release();
                    callback(null);
                  }
                });

              }

              async.series([parseGenrePosition, getConnection, insertMatch, insertInterests], function (err, results) {
                if (err) {
                  callback(err);
                } else {
                  callback(null);
                }
              });


            }
          })
        }

        if (user.limit === undefined || user.limit === 0) { //됨
          logger.log('debug', '======================');
          async.waterfall([getConnection, insertPost], function (err, result) {
            if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
              var err = {
                "message": "form-data로 사진없이 게시글 작성 실패"
              };
              Logger.log('error', '/posts (POST)', err.message);
              next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
            } else {    //동적 프로퍼티 생성?!?!
              var result = {
                "success": {
                  "message": "form-data로 사진없이 게시글이 작성되었습니다.",
                  //"userInput": user
                }
              };
              Logger.log('warn', '/posts (POST)', result.success.message);
              res.json(result);        //더미!!!!응답!!!!!!
            }
          });
        } else {
          async.waterfall([getConnection, insertPostInterest], function (err, result) {
            if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
              var err = {
                "message": "form-data로 사진없이 매칭글 작성 실패"
              };
              Logger.log('error', '/posts (POST)', err);
              next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
            } else {    //동적 프로퍼티 생성?!?!
              var result = {
                "success": {
                  "message": "form-data로 사진없이 매칭게시글이 작성되었습니다.",
                  //"userInput": user
                }
              };
              Logger.log('warn', '/posts (POST)', result.success.message);
              res.json(result);        //더미!!!!응답!!!!!!
            }
          });
        }

      } else { // 기타 (사진을 하나 올렸을 경우)
        var s3 = new AWS.S3({
          "accessKeyId": s3Config.key,
          "secretAccessKey": s3Config.secret,
          "region": s3Config.region,
          "params": {
            "Bucket": s3Config.bucket,
            "Key": s3Config.imageDir + "/" + path.basename(files['photo'].path), // 목적지의 이름
            "ACL": s3Config.imageACL,
            "ContentType": "image/jpeg" //mime.lookup
          }
        });

        var resultURL;

        function UploadServer(callback) {
          var body = fs.createReadStream(files['photo'].path);
          s3.upload({"Body": body})
            .on('httpUploadProgress', function (event) {
              //console.log(event);
            })
            .send(function (err, data) {
              if (err) {
                callback(err);
              } else {
                fs.unlink(files['photo'].path, function () {

                });
                resultURL = data.Location;
                callback(null);
              }
            });
        }

        function transPostLink(connection, callback) {
          connection.beginTransaction(function (err) {
            if (err) {
              connection.release();
              callback(err);
            } else {

              var insertPostId;

              function insertPost(callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
                var sql = "insert into matchdb.post (user_id, content)" +
                  "values ( ?, ?)";        //1=user.id
                connection.query(sql, [user.id, user.content], function (err, result) {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {    //어디서 봤던 코드..?
                    insertPostId = result.insertId;
                    callback(null);
                  }
                });
              }

              function insertNewLink(callback) {
                var sql = "INSERT INTO matchdb.file (post_id, path) " +
                  "VALUES ( ? , ? )";

                connection.query(sql, [insertPostId, resultURL], function (err, result) {
                  if (err) {

                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {
                    connection.commit();
                    connection.release();
                    callback(null);
                  }
                });

              }

              async.series([insertPost, insertNewLink], function (err) {
                if (err) {
                  callback(err);  //already release
                } else {
                  callback(null);
                }
              });
            }
          });

        }

        function transPostLinkInterests(connection, callback) {
          connection.beginTransaction(function (err) {
            if (err) {
              connection.release();
              callback(err);
            } else {

              var insertPostId;

              function insertPost(callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
                var sql = "insert into matchdb.post (user_id, content, limit_people, decide_people)" +
                  "values (?, ?, ?, ?)";        //1=user.id
                connection.query(sql, [user.id, user.content, user.limit, user.decide], function (err, result) {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {    //어디서 봤던 코드..?
                    insertPostId = result.insertId;
                    callback(null);
                  }
                });
              }

              function insertNewLink(callback) {
                var sql = "INSERT INTO matchdb.file (post_id, path) " +
                  "VALUES ( ? , ? )";

                connection.query(sql, [insertPostId, resultURL], function (err, result) {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {

                    callback(null);
                  }
                });

              }

              var interest = [];

              function parseGenrePosition(callback) {
                var i = 0;
                function each1(cb1) {
                  async.eachSeries(user.genre, function (item, cb) {
                    interest.push([item]);
                    cb(null);
                  }, function (err) {
                    if (err) {
                      callback(err);
                    }
                    cb1(null);
                  });
                }

                function each2(cb2) {
                  var i = 0;
                  async.eachSeries(user.position, function (item, cb) {
                    interest[i++].push(item);
                    cb(null);
                  }, function (err) {
                    if (err) {
                      callback(err);
                    }
                    cb2(null);
                  });
                }

                async.series([each1, each2], function (err, results) {
                  if (err) {
                    callback(err);
                  } else {

                    callback(null);
                  }
                });

              }

              function insertInterests(callback) {

                var sql = "insert into matchdb.interest (post_id, genre, position) " +
                  "    values ( ?, ?, ?)";
                async.each(interest, function (item, callback) {
                  connection.query(sql, [insertPostId, item[0], item[1]], function (err, results) {
                    if (err) {
                      callback(err);    //가장 가까운 콜백잼?
                    } else {    //어디서 봤던 코드..?
                      callback(null);
                    }
                  });
                }, function (err) {
                  if (err) {
                    connection.rollback();
                    connection.release();
                    callback(err);
                  } else {
                    connection.commit();
                    connection.release();
                    callback(null);
                  }
                });

              }

              async.series([insertPost, insertNewLink, parseGenrePosition, insertInterests], function (err) {
                if (err) {
                  callback(err);  //already release
                } else {
                  callback(null);
                }
              });
            }
          });


        }

        function deleteS3Link() {
          var s3 = new AWS.S3({
            "accessKeyId": s3Config.key,
            "secretAccessKey": s3Config.secret,
            "region": s3Config.region
          });
          var params = {
            "Bucket": s3Config.bucket,       // 목적지의 이름
            "Key": s3Config.imageDir + "/" + path.basename(resultURL)
          };

          s3.deleteObject(params, function (err, data) {
            if (err) {
              //console.log(err, err.stack);//실패시 로깅...
              Logger.log('debug', '/posts (POST)', err);
            }
          });
        }

        if (user.limit === undefined || user.limit === 0) { //됨
          async.waterfall([UploadServer, getConnection, transPostLink], function (err, result) {
            if (err) {
              deleteS3Link();
              var err = {
                "message": "form-data로 글 작성이 실패했습니다."
              };
              Logger.log('error','/posts (POST)', err.message);
              next(err);
            } else {
              var result = {
                "success": {
                  "message": "파일 업로드 게시 완료"
                }
              };
              Logger.log('warn','/posts (POST)', result.success.message);
              res.json(result);
            }
          });
        } else {
          async.waterfall([UploadServer, getConnection, transPostLinkInterests], function (err, result) {
            if (err) {
              deleteS3Link();
              var err = {
                "message": "form-data로 글 작성이 실패했습니다."
              };
              Logger.log('error','/posts (POST)', err.message);
              next(err);
            } else {
              var result = {
                "success": {
                  "message": "파일 업로드 매칭 완료"
                }
              };
              Logger.log('warn','/posts (POST)', result.success.message);
              res.json(result);
            }
          });
        }

      }
    });
  }

});

// 7. 매칭/스토리 수정     파일 업로드............
router.put('/:pid', isLoggedIn, function (req, res, next) {
  //받아온것만...+표시   //겟커넥션  // 업데이트 조건으로 pid !!! // 끝???  헐
// 셀렉 해와서  피플s 널이면 넣을 수 없기??

  var user = {
    "id": req.user.id,//req.session.userId,
    "pid": req.params.pid,

    "content": req.body.content,
    "photo": req.body.photo,
    "limit_people": req.body.limit_people,
    "decide_people": req.body.decide_people
  };

  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }   // 커넥션 얻어오고
    });
  }

  function compareUserId(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "select user_id " +
      "FROM matchdb.post " +
      "WHERE id=?";

    connection.query(sql, [user.pid], function (err, results) {
      if (err) {
        callback(err);
      } else if (user.id === results[0].user_id) {    // 작성자와 삭제할 게시물의 작성자가 같은경우
        callback(null, connection);
      } else {    // 다른 경우 삭제 ㄴㄴ함
        callback(err);
      }
    });
  }

//디비 업뎃!!!!!
  function updatePost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    if (user.limit_people !== null) {   //undeifined??

      var sql = "update post " +
        "set content= ?, limit_people = ?, decide_people=? " +
        "where id = ?";

      connection.query(sql, [
         user.content, user.limit_people,
        user.decide_people, user.pid
      ], function (err, results) {
        connection.release();
        if (err) {
          callback(err);
        } else {    //어디서 봤던 코드..?
          callback(null);
        }
      });

    } else {
      var sql = "update post " +
        "set title= ?, content= ?, limit_people = ?, decide_people=? " +
        "where id =?";

      connection.query(sql, [user.title, user.content, user.pid], function (err, results) {
        connection.release();
        if (err) {
          callback(err);
        } else {    //어디서 봤던 코드..?
          callback(null);
        }
      });
    }

  }

  async.waterfall([getConnecton, compareUserId, updatePost], function (err, result) {
    if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
      var err = {
        "message": "작성자가 아니라서 게시글을 수정할 수 없습니다."
      };
      Logger.log('err','/posts/:pid (PUT)', err.message);
      next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
    } else {    //동적 프로퍼티 생성?!?!
      var result = {
        "success": {
          "message": "게시글이 수정되었습니다.",
          "userInput": user
        }
      };
      Logger.log('err','/posts/:pid (PUT)', result.success.message);
      res.json(result);
    }
  });

});


// 8. 매칭/스토리 삭제     // 연결된 댓글도 삭제=null  + 연결된 파일도 삭제=null  (셋 널 ㄱㄱ)
router.delete('/:pid', isLoggedIn, function (req, res, next) {

  var user = {
    "id": req.user.id, //req.session.userId,
    "pid": req.params.pid,
  };

  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }   // 커넥션 얻어오고 hashPassword 바이패스... null--;;
    });
  }

  function compareUserId(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "select user_id " +
      "FROM matchdb.post " +
      "WHERE id=?";

    connection.query(sql, [user.pid], function (err, results) {
      if (err) {
        callback(err);
      } else if (user.id === results[0].user_id) {    // 작성자와 삭제할 게시물의 작성자가 같은경우
        callback(null, connection);
      } else {    // 다른 경우 삭제 ㄴㄴ함
        var err = {
          "message": "작성자가 아니라서 게시글을 지울 수 없습니다."
        };
        callback(err);
      }
    });
  }


  function deletePost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "DELETE " +
      "FROM matchdb.post " +
      "WHERE id=?";

    connection.query(sql, [user.pid], function (err, results) {
      connection.release();
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        callback(null);
      }
    });
  }


  async.waterfall([getConnecton, compareUserId, deletePost], function (err, result) {
    if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
      var err = {
        "message": "게시글이 삭제 실패되었습니다."
      }
      Logger.log('err','/posts/:pid (DELETE)', err.message);
      next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
    } else {    //동적 프로퍼티 생성?!?!
      var result = {
        "success": {
          "message": "게시글이 삭제되었습니다.",
          "userInput": user
        }
      };
      Logger.log('warn','/posts/:pid (DELETE)', result.success.message);
      res.json(result);        //더미!!!!응답!!!!!!
    }
  });

});


// 9. 매칭/스토리 상세보기  =  pid...


// 10. 매칭/스토리 목록 보기  + 상세   // 마이!!!(mid=?) + 스토리(게시글/전체/매칭)
router.get('/', isLoggedIn, function (req, res, next) {

  //검색기능 ㅜㅜ   // null 처리
  var keyword = req.query.key;
  var flag = req.query.flag;
  var mid = req.query.mid;
  var pid = req.query.pid;
  var pageNum = req.query.page;

  keyword = (keyword === null || keyword === undefined) ? undefined : keyword;
  flag = (flag === null || flag === undefined ) ? undefined : flag;
  if (mid === undefined || mid === null || mid === NaN || mid <= 0) mid = undefined;
  if (pid === undefined || pid === null || pid === NaN || pid <= 0) pid = undefined;
  if (pageNum === undefined || pageNum === null || pageNum === NaN || pageNum <= 0) pageNum = 1;

  var limit = 10;
  var offset = limit * (pageNum - 1);

  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }   // 커넥션 얻어오고 hashPassword 바이패스... null--;;
    });
  }
  var cnt = 0;
  function selectPost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql;
    // keyword = 검색 o/x   flag = 매칭/ 게시글 선택  후!!  o/x  = 4가지???

    if (flag === 'people') {    // 매칭글!!
      if (keyword === undefined || keyword === null || keyword === "") {  // 매칭    (& 키워드 X)
        var id = "";
        if ( !(mid === undefined || mid ===null || mid === "") ) {
          id = " and u.id=" + mid + " ";
        }
        var id2 = "";
        if ( !(pid === undefined || pid ===null || pid === "") ) {
          id2 = " and p.id=" + pid + " ";
        }
        sql = "SELECT p.id as 'pid', content, nickname " +
          ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
          ", limit_people, decide_people, u.id as 'mid', photo_path as 'profile' " +
          "       ,genre, position " +
          "FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
          "WHERE limit_people IS NOT NULL " + id + id2 + " ";

      } else {  // 매칭 & 키워드 O
        var id = "";
        if ( !(mid === undefined || mid ===null || mid === "") ) {
          id = " mid=" + mid + " and ";  //조건이 맨앞으로 가야함 ㅜㅜ
        }
        var id2 = "";
        if ( !(pid === undefined || pid ===null || pid === "") ) {
          id2 = " p.id=" + pid + " and ";
        }
        sql = "SELECT pid, content, nickname, date " +
          "       , limit_people, decide_people " +
          "       , genre, position, profile, mid " +
          "FROM  (SELECT p.id as 'pid', p.content, nickname " +
          "             , date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
          "             , limit_people, decide_people, genre, position, photo_path as 'profile', u.id as 'mid' " +
          "       FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
          "       WHERE "+id2+" limit_people IS NOT NULL ) matching " +
          "WHERE "+id+" content like '%" + keyword + "%' or nickname like '%" + keyword + "%' " ;
      }

    } else if (flag === 'story') {    // 매칭글!!
      if (keyword === undefined || keyword === null || keyword === "") {  // 매칭    (& 키워드 X)
        var id2 = "";
        if ( !(pid === undefined || pid ===null || pid === "") ) {
          id2 = " p.id=" + pid + " and ";
        }
        sql = "SELECT p.id as 'pid', content, nickname " +
          ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
          ", limit_people, decide_people, u.id as 'mid', photo_path as 'profile' " +
          "       ,genre, position " +
          "FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
          "WHERE "+id2+" limit_people IS NULL ";
        if ( !(mid === undefined || mid ===null || mid === "") ) {
            sql = sql + " and u.id=" + mid + " ";
        }

      } else {  // 매칭 & 키워드 O
        var id = "";
        if ( !(mid === undefined || mid ===null || mid === "") ) {
          id = " mid=" + mid + " and ";  //조건이 맨앞으로 가야함 ㅜㅜ
        }
        var id2 = "";
        if ( !(pid === undefined || pid ===null || pid === "") ) {
          id2 = " p.id=" + pid + " and ";
        }
        sql = "SELECT pid, content, nickname, date " +
          "       , limit_people, decide_people " +
          "       , genre, position, profile, mid " +
          "FROM  (SELECT p.id as 'pid', p.content, nickname, u.id as 'mid' " +
          "             , date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
          "             , limit_people, decide_people, genre, position, photo_path as 'profile' " +
          "       FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
          "       WHERE "+id2+" limit_people IS NULL ) story " +
          "WHERE "+id+" content like '%" + keyword + "%' or nickname like '%" + keyword + "%' " ;
      }
    } else {  //flag !== people& !== story!!   = 전체 !!!  게시글
      if (keyword === undefined || keyword === null || keyword === "") {
        var id2="";
        if ( !(pid === undefined || pid ===null || pid === "") ) {
          id2 = " p.id=" + pid + " and ";
        }
        sql = "SELECT p.id as 'pid', content, nickname " +
          ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
          ", limit_people, decide_people, u.id as 'mid', photo_path as 'profile' " +
          "       ,genre, position " +
          "FROM matchdb.post p   join matchdb.user u on(u.id = p.user_id) " +
          "WHERE "+id2+" p.id IS NOT NULL " ;
        if ( !(mid === undefined || mid ===null || mid === "") ) {
            sql = sql + " and u.id=" + mid + " ";
        }

      } else { /// 전체!! & 키워드 O
        var id = "";
        if ( !(mid === undefined || mid ===null || mid === "") ) {
          id = " mid=" + mid + " and ";  //조건이 맨앞으로 가야함 ㅜㅜ
        }
        if ( !(pid === undefined || pid ===null || pid === "") ) {
          id2 = " p.id=" + pid + " and ";
        }
        sql = "SELECT pid, content, nickname, date " +
          "       , limit_people, decide_people " +
          "       , genre, position, profile, mid " +
          "FROM  (SELECT p.id as 'pid', p.content, nickname " +
          "             , date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
          "             , limit_people, decide_people, genre, position, photo_path as 'profile', u.id as 'mid' " +
          "       FROM matchdb.post p  join matchdb.user u on(u.id = p.user_id)" +
          "       WHERE "+id2+" p.id is NOT NULL ) total " +
          "WHERE "+id+" content like '%" + keyword + "%' or nickname like '%" + keyword + "%' " ;
      }
    }

    connection.query(sql, [], function (err, results) {//for count
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        cnt = results.length;
      }
    });

    sql = sql + "ORDER BY date desc " +
                "LIMIT ? OFFSET ?";

    connection.query(sql, [limit, offset], function (err, results) {
      connection.release();
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        callback(null, connection, results);
      }
    });
  }

  function selectFiles(connection, results, callback) {
    var sql = "SELECT path " +
      "FROM matchdb.file " +
      "WHERE post_id = ? ";
    var i = 0;
    async.each(results, function (item, cb) {
      connection.query(sql, [item.pid], function (err, result) {
        if (err) {
          cb(err);
        } else {
          item.photo = [];//필수
          //if(result.length) {//리절트 없는경우(path X) ㄱㄱ
          //  item.photo = result;  //리절트 = 배열 ㅇㅇ  걍 잼
          //}
          //배열 없으면 아마 실행 안될껄? ㅇㅇ..
          async.eachSeries(result, function (item2, cb) {
            item.photo.push(item2.path);
            cb(null);
          }, function (err) {
            if (err) {
              cb(err);
            } else {
              cb(null);//?
            }
          });

        }
      });
    }, function (err) {
      if (err) {
        connection.release();
        callback(err);
      } else {
        callback(null, results);
      }
    });


  }

  async.waterfall([getConnecton, selectPost, selectFiles], function (err, results) {
    if (err) {
      var err = {
        "message": "게시글이 목록조회를 실패 했습니다."
      };
      Logger.log('error', '/posts (POST)', err.message);
      next(err);
    } else {
      var result = {
        "success": {
          "message": "게시글이 목록조회되었습니다.",
          "page": req.query.page,
          "pageLimit": 10,
          "count" : cnt,
          "data": results
        }
      };
      Logger.log('warn', '/posts (POST)' + result.success.message);
      res.json(result);        //더미!!!!응답!!!!!!
    }
  });

});


// 11. 매칭/스토리 댓글쓰기    //req.user.id 없으면 터짐 ㅜㅜ (로그인 안되있으면 )
router.post('/:pid/replies', isLoggedIn, function (req, res, next) {
  var pid = req.params.pid;  //오 있으면 안터짐
// 겟커넥션  댓글 쓰기(닉넴=세션(패포)ㄱㄱ)올..ㅋ   끝???

  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }   // 커넥션 얻어오고 hashPassword 바이패스... null--;;
    });
  }

  function insertReply(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!

    var sql = "INSERT into matchdb.comment (content, post_id, user_id) " +
      "VALUES (?, ?, ?)";

    connection.query(sql, [req.body.content, req.params.pid, req.user.id], function (err, results) {
      connection.release();               // req.user.id 없으면 터짐 ㅜㅜ
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        callback(null, results);
      }
    });
  }

  async.waterfall([getConnecton, insertReply], function (err, results) {
    if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
      var err = {
        "message" : "댓글이 작성 실패되었습니다."
      };
      Logger.log('warn', '/posts (POST)' + result.success.message);
      next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
    } else {    //동적 프로퍼티 생성?!?!
      var result = {
        "success": {
          "message": "댓글이 작성되었습니다.",
          "results": {
            "content": req.body.content,
            "pid": req.params.pid,
            "uid": req.user.id
          }
        }
      };
      Logger.log('warn', '/posts/'+pid+'/replies (POST)' + result.success.message);
      res.json(result);        //더미!!!!응답!!!!!!
    }
  });


});
// 12. 매칭/스토리 댓글수정    //req.user.id 없으면 터짐 ㅜㅜ (로그인 안되있으면 )
router.put('/:pid/replies/:rid', isLoggedIn, function (req, res, next) {
  var userId = req.user.id;  //오 있으면 안터짐
  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }   // 커넥션 얻어오고
    });
  }

  function compareUserIdPostID(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "SELECT user_id, post_id " +
      "FROM matchdb.comment " +
      "WHERE id=?";

    connection.query(sql, [req.params.rid], function (err, results) {
      if (err) {
        callback(err);
      }
      if (results.length === 0) {
        connection.release();
        var err = {
          "message": "해당 댓글이 없어서 댓글을 수정할 수 없습니다."
        };
        callback(err);
      } else if (req.user.id === results[0].user_id || req.params.pid === results[0].post_id) {    // 작성자와 삭제할 게시물의 작성자가 같은경우
        callback(null, connection);
      } else {    // 다른 경우 삭제 ㄴㄴ함
        connection.release();
        var err = {
          "message": "작성자나 해당게시글의 댓글이 아니라서 댓글을 수정할 수 없습니다."
        };
        callback(err);
      }
    });
  }

//디비 업뎃!!!!!
  function updateReply(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "UPDATE matchdb.comment " +
      "SET content = ? " +
      "WHERE id = ?";

    connection.query(sql, [req.body.content, req.params.rid], function (err, results) {
      connection.release();
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        callback(null);
      }
    });
  }

  async.waterfall([getConnecton, compareUserIdPostID, updateReply], function (err, result) {
    if (err) {
      next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
    } else {
      var result = {
        "success": {
          "message": "게시글이 수정되었습니다.",
        }
      };
      res.json(result);
    }
  });


});
// 13. 매칭/스토리 댓글삭제      //pid 는 게시글 지울때에 필요할수도! (같이삭제??)
//req.user.id 없으면 터짐 ㅜㅜ (로그인 안되있으면 )
router.delete('/:pid/replies/:rid', isLoggedIn, function (req, res, next) {
//겟커 작성자 id 확인후!? 지움 끝?
  var userId = req.user.id;  //오 있으면 안터짐
  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }
    });
  }

  function compareUserIdPostID(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "SELECT user_id, post_id " +
      "FROM matchdb.comment " +
      "WHERE id=?";

    connection.query(sql, [req.params.rid], function (err, results) {
      if (err) {
        callback(err);
      }
      if (results.length === 0) {
        connection.release();
        var err = {
          "message": "해당 댓글이 없어서 댓글을 삭제할 수 없습니다."
        };
        callback(err);
      } else if (req.user.id === results[0].user_id || req.params.pid === results[0].post_id) {    // 작성자와 삭제할 게시물의 작성자가 같은경우
        callback(null, connection);
      } else {    // 다른 경우 삭제 ㄴㄴ함
        connection.release();
        var err = {
          "message": "작성자나 해당게시글의 댓글이 아니라서 댓글을 삭제할 수 없습니다."
        };
        callback(err);
      }
    });
  }

  function deleteReply(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
    var sql = "DELETE " +
      "FROM matchdb.comment " +
      "WHERE id=?";
    connection.query(sql, [req.params.rid], function (err, results) {
      connection.release();
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        callback(null);
      }
    });
  }

  async.waterfall([getConnecton, compareUserIdPostID, deleteReply], function (err, result) {
    if (err) {
      next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
    } else {
      var result = {
        "success": {
          "message": "게시글이 삭제되었습니다.",
        }
      };
      res.json(result);
    }
  });

});
// 14. 매칭/스토리 댓글 더보기
router.get('/:pid/replies', isLoggedIn, function (req, res, next) {
var pid = req.params.pid;

  function getConnecton(callback) {
    pool.getConnection(function (err, connection) {
      if (err) {
        callback(err);
      } else {
        callback(null, connection);//..........
      }   // 커넥션 얻어오고 hashPassword 바이패스... null--;;
    });
  }

  function selectReply(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!

    var sql = "SELECT r.id as 'rid', content, u.nickname, photo_path as 'profile' ,u.id as 'mid' " +
      "       ,genre, position " +
      "         , date_format(CONVERT_TZ(comm_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'date' " +
      "FROM matchdb.comment r	join matchdb.user u on(u.id = r.user_id) " +
      "WHERE r.post_id=" + pid + " " +
      "ORDER BY date desc " +
      "LIMIT ? OFFSET ? ";

    var pageNum = req.query.page;
    var limit = 10;
    var offset = limit * (pageNum - 1);

    connection.query(sql, [limit, offset], function (err, results) {
      connection.release();
      if (err) {
        callback(err);
      } else {    //어디서 봤던 코드..?
        callback(null, results);
      }
    });
  }


  async.waterfall([getConnecton, selectReply], function (err, results) {
    if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
      next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
    } else {    //동적 프로퍼티 생성?!?!
      var result = {
        "success": {
          "message": "댓글이 목록조회되었습니다.",
          "page": req.query.page,
          "pageLimit": 10,
          "data": results
        }
      };
      res.json(result);        //더미!!!!응답!!!!!!
    }
  });

  // 겟커넥션 - 페이징!! + 거의 다갖고옴...=상세보기&댓글?  - 끝??

});

module.exports = router;