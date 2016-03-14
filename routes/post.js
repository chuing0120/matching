var express = require('express');
var async = require('async');
var bcrypt = require('bcrypt');

var router = express.Router();

// 6. 매칭/스토리 쓰기 (HTTP)     파일 업로드............?? + 구인;;;;;;;;;;
router.post('/', function (req, res, next) {

      var user = {
          "id": req.user.id,//req.session.userId,       // id = user_id !!
          "title": req.body.title,
          "content": req.body.content,
          "limit": req.body.limit,  //  언디파인이면 게시글
          "decide": req.body.decide, //  값 존재 = 매칭!!
          "genre": req.body.genre,  // 장르 받아옴
          "position": req.body.position, // 포지션받아옴
      };
      var interest = [];  // + parseInt() !!!
      //객체로 넣으면 되겠군!!!
      function parseGenrePosition(callback) {
          var i=0;
          function each1(cb1) {
              async.eachSeries(user.genre, function (item, cb) {
                  interest.push([item]);
                  //interest.push({"genre": item});
                  cb();
              }, function (err) {
                  if (err) {
                      callback(err);
                  }
                  console.log('인터1', interest);//나옴;;
                  cb1();
              });
          };

          function each2(cb2) {
              var i=0;
              async.eachSeries(user.position, function (item, cb) {
                  interest[i++].push( item);
                  //interest[i++].push({"position": item});
                  console.log('pitem', item);//됨 망
                  cb();
              }, function (err) {
                  if (err) {
                      console.log('에러2', err);
                      callback(err);
                  }
                  console.log('인터2', interest);
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

      //parseGenrePosition();되긴한데... 도중에 안되네??
      //1개만 왔을경우? 리밋=3 디사=언디 = 0으로..   리밋?? 디사 3 ==??? 매칭?
      // 리밋이 1보다 작은경우...=매칭..?
      // 숫자가 아닐경우........ NaN!!!??
      // 리밋보다 디사가 클경우...........

      //겟 커넥션 //닉넴 사진! 장르 포지션 가지고 오기?   //디비 인서트!!!!!!  유저id필수!!  //끝?!

      function getConnection(callback) {
          pool.getConnection(function (err, conn) {
              if (err) {
                  callback(err);
              } else {
                  callback(null, conn);//..........
              }
          });
      }

//세션아이디로!!!   닉넴 (서버주소?!=클라..)사진경로 장르 포지션 가지고 오기?!!
      function selectMember(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
          var sql = "SELECT nickname, genre, position, photo_path " +
            "FROM matchdb.user " +
            "WHERE id = ?";
          connection.query(sql, [user.id], function (err, results) {
              if (err) {
                  connection.release();
                  callback(err);
              } else {    //어디서 봤던 코드..?
                  callback(null, connection, results);
              }
          });
      }

//디비 인서트!!!!!!  //기존코드 = 게시글작성
      function insertPost(connection, results, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
          var sql = "insert into matchdb.post (user_id, title, content) " +
            "    values ( ?, ?, ?)";        //1=user.id
          connection.query(sql, [user.id, user.title, user.content], function (err, results) {
              connection.release();
              if (err) {
                  callback(err);
              } else {    //어디서 봤던 코드..?
                  callback(null);
              }
          });
      }
      var insertId;

      function insertPostInterest(connection, results, callback) {
          connection.beginTransaction(function (err) {  //오 롤백된듯? 엥 아닌가??
              if (err) {
                  console.log("트렌젝션실패..");
                  connection.release();
                  callback(err);
              } else {

                  function insertMatch( callback) {
                      var sql = "INSERT into matchdb.post (user_id, title, content, limit_people, decide_people) " +
                        "VALUES ( ?, ?, ?, ?, ?)";
                      connection.query(sql, [user.id, user.title, user.content,
                          user.limit, user.decide], function (err, result) {
                          if (err) {
                              connection.rollback();
                              connection.release();
                              callback(err);
                          } else {    //어디서 봤던 코드..?
                              insertId = result.insertId;
                              callback(null, connection);
                          }
                      });
                  }
// todo 개수 다를때 라든지.. ㅜㅜ  언디파인(=공백=낫널..)이면 널로 넣어야할듯?
                  function insertInterests(callback) {

                      var sql = "insert into matchdb.interest (post_id, genre, position) " +
                        "    values ( ?, ?, ?)";
                      async.each(interest, function(item, callback) {
                          connection.query(sql, [insertId, item[0], item[1]], function (err, results) {
                              if (err) {
                                  connection.rollback();
                                  connection.release();
                                  callback(err);    //가장 가까운 콜백잼?
                              } else {    //어디서 봤던 코드..?
                                  console.log('item complete',item);
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


      if (user.limit === undefined) { //됨
          async.waterfall([getConnection, selectMember, insertPost], function (err, result) {
              if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
                  next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
              } else {    //동적 프로퍼티 생성?!?!
                  var result = {
                      "success": {
                          "message": "게시글이 작성되었습니다.",
                          "userInput": user
                      }
                  };
                  res.json(result);        //더미!!!!응답!!!!!!
              }
          });
      } else {
          async.waterfall([getConnection, selectMember, insertPostInterest], function (err, result) {
              if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
                  next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
              } else {    //동적 프로퍼티 생성?!?!
                  var result = {
                      "success": {
                          "message": "게시글이 작성되었습니다.",
                          "userInput": user
                      }
                  };
                  res.json(result);        //더미!!!!응답!!!!!!
              }
          });
      }


  }
);

// 7. 매칭/스토리 수정     파일 업로드............
router.put('/:pid', function (req, res, next) {
    //받아온것만...+표시   //겟커넥션  // 업데이트 조건으로 pid !!! // 끝???  헐
// 셀렉 해와서  피플s 널이면 넣을 수 없기??

    var user = {
        "id": req.user.id,//req.session.userId,
        "pid": req.params.pid,
        "title": req.body.title,
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
                var err = {
                    "message": "작성자가 아니라서 게시글을 수정할 수 없습니다."
                };
                callback(err);
            }
        });
    }

//디비 업뎃!!!!!
    function updatePost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
        if (user.limit_people !== null) {   //undeifined??

            var sql = "update post " +
              "set title= ?, content= ?, limit_people = ?, decide_people=? " +
              "where id = ?";

            connection.query(sql, [
                user.title, user.content, user.limit_people,
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
            next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
        } else {    //동적 프로퍼티 생성?!?!
            var result = {
                "success": {
                    "message": "게시글이 수정되었습니다.",
                    "userInput": user
                }
            };
            res.json(result);
        }
    });

});


// 8. 매칭/스토리 삭제     // 연결된 댓글도 삭제;;;;  + 세션아이디 db user_아이디(FK) 비교
router.delete('/:pid', function (req, res, next) {

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
            next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
        } else {    //동적 프로퍼티 생성?!?!
            var result = {
                "success": {
                    "message": "게시글이 삭제되었습니다.",
                    "userInput": user
                }
            };
            res.json(result);        //더미!!!!응답!!!!!!
        }
    });

});


// 9. 매칭/스토리 상세보기  =  삭제


// 10. 매칭/스토리 목록 보기  + 상세   //검색기능 ㅜㅜㅜㅜㅜㅜ
router.get('/', function (req, res, next) {

    //검색기능 ㅜㅜ
    var keyword = req.query.key;
    var flag = req.query.flag;  //  닉/제목/내용/제목+내용 flag!!!
    function getConnecton(callback) {
        pool.getConnection(function (err, connection) {
            if (err) {
                callback(err);
            } else {
                callback(null, connection);//..........
            }   // 커넥션 얻어오고 hashPassword 바이패스... null--;;
        });
    }

    function selectPost(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!
        // 페이지 안들어왔을때 처리 안한듯..ㅜ
        var pageNum = req.query.page;
        var limit = 3;
        var offset = limit * (pageNum - 1);
        var sql;

        if (keyword !== undefined) {
            switch (flag) {
                case 'nick':    //닉/제목/내용/제목+내용
                    sql = "SELECT p.id, title, content, nickname " +
                      ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'post_date' " +
                      ", limit_people, decide_people " +
                      "FROM matchdb.post p join matchdb.user u on(u.id = p.user_id) " +
                      "WHERE nickname like " +
                      connection.escape('%' + keyword + '%') + " " +
                      "LIMIT ? OFFSET ? ";// +
                    break;

                case 'title':
                    sql = "SELECT p.id, title, content, nickname " +
                      ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'post_date' " +
                      ", limit_people, decide_people " +
                      "FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
                      "WHERE title like ? " +
                      connection.escape(keyword) + " " +
                      "LIMIT ? OFFSET ? ";// +
                    break;

                case 'content':
                    sql = "SELECT p.id, title, content, nickname " +
                      ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'post_date' " +
                      ", limit_people, decide_people " +
                      "FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
                      "WHERE content like " +
                      connection.escape('%' + keyword + '%') + " " +
                      "LIMIT ? OFFSET ? ";// +
                    break;
                default:
                    break;
            }
        } else {
            sql = "SELECT p.id, title, content, nickname " +
              ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'post_date' " +
              ", limit_people, decide_people " +
              "FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
              "LIMIT ? OFFSET ? ";// +
        }

        if (flag === 'people') {
            sql = "SELECT p.id, title, content, nickname " +
              ", date_format(CONVERT_TZ(post_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'post_date' " +
              ", limit_people, decide_people " +
              "FROM matchdb.post p	join matchdb.user u on(u.id = p.user_id) " +
              "WHERE limit_people IS NOT NULL " +
              "LIMIT ? OFFSET ?";
        }

        connection.query(sql, [limit, offset], function (err, results) {
            connection.release();
            if (err) {
                callback(err);
            } else {    //어디서 봤던 코드..?
                callback(null, results);
            }
        });
    }

    async.waterfall([getConnecton, selectPost], function (err, results) {
        if (err) {  //selectMember????? 왜필요하더라.. id 겟??  중복가입 방지인가??
            next(err);  //워터폴중에 에러나면 바로 여기로!!!!!!
        } else {    //동적 프로퍼티 생성?!?!
            async.each(results, function iterator(result, callback) {
                result.id += 10;
                console.log(result);
                callback(null);
            }, function (err) {
                if (err) {
                    console.log('에러라니');
                } else {
                    console.log('던', results);
                }
            });

            var result = {
                "success": {
                    "message": "게시글이 목록조회되었습니다.",
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


// 11. 매칭/스토리 댓글쓰기
router.post('/:pid/replies', function (req, res, next) {

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

    function selectReply(connection, callback) {   //커넥션 필요...=겟커넥션.. ㅇㅇ db SELECT!!!

        var sql = "INSERT into matchdb.comment (content, post_id, user_id) " +
          "VALUES (?, ?, ?)";

        connection.query(sql, [req.body.content, req.params.pid, req.user.id], function (err, results) {
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
                    "message": "댓이 작성되었습니다.",
                    "results": {
                        "content": req.body.content,
                        "pid": req.params.pid,
                        "uid": req.user.id
                    }
                }
            };
            res.json(result);        //더미!!!!응답!!!!!!
        }
    });


});
// 12. 매칭/스토리 댓글수정
router.put('/:pid/replies/:rid', function (req, res, next) {

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
router.delete('/:pid/replies/:rid', function (req, res, next) {
//겟커 작성자 id 확인후!? 지움 끝?
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
router.get('/:pid/replies', function (req, res, next) {


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

        var sql = "SELECT r.id, content, u.nickname " +
          "         , date_format(CONVERT_TZ(comm_date, '+00:00', '+9:00'), '%Y-%m-%d %H-%i-%s') as 'comm_date' " +
          "FROM matchdb.comment r	join matchdb.user u on(u.id = r.user_id) " +
          "ORDER BY r.id " +
          "LIMIT ? OFFSET ? ";// +
        //   "WHERE id = ?";
        var pageNum = req.query.page;
        var limit = 3;
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


    var result = {
        "success": {
            "message": "글 댓글 불러오기 성공",
            "page": 2,
            "pageLimit": 10,
            "data": [{
                "title": "제목",
                "date": "작성일시",
                "genre": "장르",
                "position": "포지션",
                "nickname": "작성자",
                "photo": "./public/profile/xxx.jpg",
                "pid": "매칭/스토리번호"
            }]
        }
    };


});

module.exports = router;