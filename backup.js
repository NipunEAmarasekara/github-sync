const config = require('./config');
const child_process = require('child_process');
const { Octokit } = require("@octokit/rest");
const aws = require('aws-sdk');
const fs = require("fs");
const stream = require("stream");
const request = require("request");
const Promise = require("bluebird");
const mime = require('mime-types');
const { spawn } = require('child_process');

let options = { stdio: 'ignore', shell: true };
let mode = null;
let codecommit = null;
let s3 = null;
let repositories = null;
let count = 0;

//Initialize github api
const octokit = new Octokit({
    auth: config.GITHUB_ACCESS_TOKEN,
});

//Get organizations list from github
async function getOrganizations() {
    try {
        const organizations = await octokit.rest.orgs.listForAuthenticatedUser();
        if (organizations.data.length > 0) {
            return organizations.data;
        } else {
            return {
                message: 'You are not in an organization',
                error: true
            };
        }
    } catch (e) {
        return null;
        console.log(e);
    }
}

//Get repositories for each organization from github
async function getRepoList() {
    let repos = [];
    try {
        const organizations = await getOrganizations();
        if (!organizations.error) {
            // await Promise.all(organizations.map(async (org) => {
            //     const obj = await octokit.rest.repos.listForOrg({ org: org.login, per_page: 100});
            //     obj.data.forEach(repo => {
            //         repos.push(repo);
            //     });
            // }));
            await Promise.all(organizations.map(async (org) => {
                await octokit.paginate(
                    octokit.repos.listForOrg,
                    {
                        org: org.login,
                        type: 'all',
                        per_page: 100,
                    },
                    (response) => {
                        response.data.forEach(repo => {
                            repos.push(repo);
                        });
                    }
                );
            }));
            if (repos.length > 0) {
                return repos;
            } else {
                return {
                    message: 'There aren\'t any repositories.',
                    error: true
                };
            }
        } else {
            return {
                message: organizations.message,
                error: organizations.error
            };
        }
    } catch (e) {
        console.log(e);
        return null;
    }
}

//Github to Codecommit backup process
async function backupProcess() {
    try {
        return new Promise(async (resolve, reject) => {
            console.log('\n####################### Started Github Backup Process #######################\n');
            repositories = await getRepoList();
            repositories = repositories.sort((a, b) => b.size - a.size);
            repositories.forEach(async (repository, index) => {
                let username = repository.owner.login;
                let repo = repository.name;

                //Check if the repository exists on codecommit.Create a repository if it doesn't exists.
                if (mode === 'cc' || mode === undefined) {
                    codecommit.getRepository({ repositoryName: `${username}_${repo}` }, function (err, data) {
                        if (err) {
                            if (err.code === 'RepositoryDoesNotExistException') {
                                if (repository.description) {
                                    if (repository.description != "")
                                        child_process.execSync(`aws codecommit create-repository --repository-name ${username}_${repo} --repository-description "${(repository.description) ? repository.description : ''}"`, options);
                                    else
                                        child_process.execSync(`aws codecommit create-repository --repository-name ${username}_${repo}`, options);
                                } else
                                    child_process.execSync(`aws codecommit create-repository --repository-name ${username}_${repo}`, options);
                            }
                        }
                    });
                }

                //Get repository branches list from the github
                const branches = (await octokit.rest.repos.listBranches({ owner: repository.owner.login, repo: repository.name })).data;

                branches.forEach(async branch => {
                    //Check if the local backup is exists. Clone the repository and push content to the codecommit if the local backup doesn't exists
                    if (!fs.existsSync(`${config.LOCAL_BACKUP_PATH}/repos/${username}/${repo}`)) {
                        console.log(`clonning ${repo} repository`);
                        child_process.execSync(`git clone https://${username}:${config.GITHUB_ACCESS_TOKEN}@github.com/${username}/${repo}.git ${config.LOCAL_BACKUP_PATH}/repos/${username}/${repo}`, options);
                        child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`, options);
                        console.log(`${repo} repository cloned`);
                        if (mode === 'cc' || mode === undefined)
                            child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${repository.owner.login}_${repository.name} ${branch.name}`, options);
                    } else {
                        console.log(`${repository.name}:${branch.name} refreshed`);
                        //child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`, options);
                        spawn(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`, [], options);
                        if (mode === 'cc' || mode === undefined)
                            child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${repository.owner.login}_${repository.name} ${branch.name}`, options);
                    }
                });

                //If the github repository default branch is not the default branch in codecommit. set it to the original default branch.
                if (mode === 'cc' || mode === undefined) {
                    codecommit.getRepository({ repositoryName: `${username}_${repo}` }, function (err, data) {
                        if (data.repositoryMetadata.defaultBranch !== repository.default_branch) {
                            try {
                                codecommit.updateDefaultBranch({ defaultBranchName: repository.default_branch, repositoryName: `${username}_${repo}` }, function (err, data) {
                                    if (err === null)
                                        console.log(`Default branch set to ${repository.default_branch} in ${username}_${repo}`);
                                });
                            } catch (e) {
                                console.log(e);
                            }
                        }
                    });

                    //Remove deleted branches
                    codecommit.listBranches({ repositoryName: `${username}_${repo}` }, function (err, data) {
                        data.branches.forEach(cb => {
                            if (!(branches.filter(b => b.name === cb).length > 0)) {
                                codecommit.deleteBranch({ branchName: cb, repositoryName: `${username}_${repo}` }, function (err, data) {
                                    if (err === null)
                                        console.log(`${cb} branch removed from codecommit.`);
                                    else
                                        console.log(err);
                                });
                            }
                        });
                    });
                    console.log(`[✓] ${repo} Repository synced to codecommit.\n`);
                }
                if (mode === 'none')
                    console.log(`[✓] ${repo} Repository locally synced.\n`);
            });
            setTimeout(() => {
                resolve();
                ;
            }, 5000
            );
        });
    } catch (e) {
        return e;
    }
}

async function localToS3() {
    try {
        await backupProcess();
        repositories.forEach(async repo => {
            console.log(repoUpdated(repo));
            if (repo.size / 1000 < config.REPO_MAX_SIZE) {
                if (fs.existsSync(`${config.LOCAL_BACKUP_PATH}/repos/${repo.owner.login}/${repo.name}`)) {
                    console.log(`Creating ${repo.full_name}.zip : size - ${repo.size / 1000}`);
                    child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/ && zip -r ${config.LOCAL_BACKUP_PATH}/repos/${repo.full_name}.zip ${repo.owner.login}/${repo.name}`, options);
                    const stream = fs.createReadStream(`${config.LOCAL_BACKUP_PATH}/repos/${repo.full_name}.zip`);
                    const contentType = mime.lookup(`${config.LOCAL_BACKUP_PATH}/repos/${repo.full_name}.zip`);

                    const params = {
                        Bucket: config.AWS_S3_BUCKET_NAME,
                        Key: repo.full_name + ".zip",
                        Body: stream,
                        ContentType: contentType
                    };

                    try {
                        await s3.upload(params, { partSize: 10 * 1024 * 1024, queueSize: 5 }).promise();
                        child_process.execSync(`rm ${config.LOCAL_BACKUP_PATH}/repos/${repo.full_name}.zip`, options);
                        console.log('upload OK', `${config.LOCAL_BACKUP_PATH}/repos/${repo.full_name}.zip`);
                    } catch (error) {
                        console.log('upload ERROR', `${config.LOCAL_BACKUP_PATH}/repos/${repo.full_name}.zip`, error);
                    }
                }
            }
            ++count;
        });
    } catch (e) {
        console.log(e);
    }
}

module.exports.init = async (m) => {
    mode = m;

    //Initialize aws, codecommit and s3
    if (mode !== 'none') {
        aws.config.credentials = new aws.Credentials(config.AWS_CC_ACCESS_KEY, config.AWS_CC_ACCESS_SECRET);
        if (mode === 'cc' || mode === undefined)
            codecommit = new aws.CodeCommit({ apiVersion: '2015-04-13', region: 'us-east-1' });

        if (mode === 's3' || mode === undefined)
            s3 = new aws.S3({ accessKeyId: config.AWS_CC_ACCESS_KEY, secretAccessKey: config.AWS_CC_ACCESS_SECRET, maxRetries: 2 });
    }

    await localToS3();

    //Wait until the end of the backup process
    const interval = setInterval(function () {
        if (count === repositories.length - 1) {
            console.log('\n####################### Completed Github Backup Process #######################\n');
            clearInterval(interval);
            return null;
        }
    }, 2000);
};

//Default repository only
async function directGitToS3(repo, index, repositoryCount) {
    try {
        console.log(`${repo.name} : ${index}/${repositoryCount} : size: ${(repo.size / 1000).toFixed(2)}MB`);
        const uploader = Promise.promisify(s3.upload.bind(s3));
        const passThroughStream = new stream.PassThrough();
        const arhiveURL =
            `https://api.github.com/repos/${repo.full_name}/zipball/${repo.default_branch}?access_token=${config.GITHUB_ACCESS_TOKEN}`;
        const requestOptions = {
            url: arhiveURL,
            headers: {
                "User-Agent": "nodejs",
                "Authorization": `token ${config.GITHUB_ACCESS_TOKEN}`,
            }
        };
        await new Promise((resolve, reject) => {
            request(requestOptions, function (error, response, body) {
                if (error) {
                    reject(error);
                    throw new Error(error);
                }
                resolve("done");
            }).pipe(passThroughStream);
        });
        const bucketName = config.AWS_S3_BUCKET_NAME;
        const objectName = repo.full_name + ".zip";
        const params = {
            Bucket: bucketName,
            Key: objectName,
            Body: passThroughStream,
            //StorageClass: options.s3StorageClass || "STANDARD",
            StorageClass: "STANDARD",
            ServerSideEncryption: "AES256"
        };

        return uploader(params).then(result => {
            console.log(`[✓] ${repo.full_name} Repository synced to s3.\n`)
        });
    } catch (e) {
        console.log(e);
    }
}

function repoUpdated(repo){
    return (new Date(repo.updated_at) < new Date(new Date().getTime() - 24*60*60*1000)) ? false : true;
}