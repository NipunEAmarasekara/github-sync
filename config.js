const config = {};

config.GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
config.AWS_CC_SSH_KEY = process.env.AWS_CC_SSH_KEY;
config.AWS_CC_ACCESS_KEY = process.env.AWS_CC_ACCESS_KEY;
config.AWS_CC_ACCESS_SECRET = process.env.AWS_CC_ACCESS_SECRET;

config.LOCAL_BACKUP_PATH = process.env.LOCAL_BACKUP_PATH;
config.REPO_MAX_SIZE = process.env.REPO_MAX_SIZE;

config.AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
config.AWS_S3_STORAGE_CLASS = process.env.AWS_S3_STORAGE_CLASS;

module.exports = config;