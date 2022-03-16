const config = {};

config.GITHUB_ACCESS_TOKEN = {};
config.AWS_CC_SSH_KEY = {};
config.AWS_CC_ACCESS_KEY = {};
config.AWS_CC_ACCESS_SECRET = {};

config.GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
config.AWS_CC_SSH_KEY = process.env.AWS_CC_SSH_KEY;
config.AWS_CC_ACCESS_KEY = process.env.AWS_CC_ACCESS_KEY;
config.AWS_CC_ACCESS_SECRET = process.env.AWS_CC_ACCESS_SECRET;

module.exports = config;