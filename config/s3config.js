module.exports = {
  "key" : process.env.FMS_S3_KEY,
  "secret" : process.env.FMS_S3_SECRET,
  "region" : "ap-northeast-2", //-1은 도쿄, -2는 서울을 의미한다.
  "bucket" : process.env.FMS_S3_BUCKET,
  "imageDir" : process.env.FMS_S3_IMAGEDIR,
  "imageACL" : "public-read"
}