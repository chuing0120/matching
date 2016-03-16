var sk;


var conn = pool.getConnection(function(err, connection) {
   if(err) {

   } else {
      conn = connection;
   }
});

exports.setServerKey = function(serverKey) {
   sk = serverKey;
}

exports.encrypt = function(number) {
   number = parseInt(number);
   var enc = "";
   for(var i = 1; i<number; i++) {
      enc += " aes_encrypt(?, unhex(" + conn.escape(sk) + ")), ";
   }

   enc += " aes_encrypt(?, unhex(" + conn.escape(sk) + ")) ";
   return enc;
}

exports.decrypt = function(data, end) {
   if(!end) {
      var enc = "convert(aes_decrypt(" + data + ", unhex(" + conn.escape(sk) + ")) using utf8) as " + data + ", ";
      return enc;
   } else {
      var enc = "convert(aes_decrypt(" + data + ", unhex(" + conn.escape(sk) + ")) using utf8) as " + data + " ";
      return enc;
   }
}

