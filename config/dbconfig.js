var config = {
    "host": process.env.FMS_DB_SERVER,
    "user": process.env.FMS_DB_USERNAME,
    "password": process.env.FMS_DB_PASSWORD,
    "database": process.env.FMS_DB,
    "debug": true
};

module.exports = config;