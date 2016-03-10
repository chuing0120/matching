module.exports = {
  "key" : process.env.FMS_S3_KEY,
  "secret" : process.env.FMS_S3_SECRET,
  "region" : "ap-northeast-2",
  "bucket" : process.env.FMS_S3_BUCKET,
  "imageDir" : process.env.FMS_S3_IMAGEDIR,
  "imageACL" : "public-read"
}