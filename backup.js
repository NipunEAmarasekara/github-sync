const config = require('./config');
const child_process = require('child_process');
const { Octokit } = require("@octokit/rest");
const aws = require('aws-sdk');
const fs = require("fs");

let response = null;

//Initialize github api
const octokit = new Octokit({
    auth: config.GITHUB_ACCESS_TOKEN,
});

//Initialize aws and codecommit
aws.config.credentials = new aws.Credentials(config.AWS_CC_ACCESS_KEY, config.AWS_CC_ACCESS_SECRET);
var codecommit = new aws.CodeCommit({ apiVersion: '2015-04-13', region: 'us-east-1' });

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
            //     const obj = await octokit.rest.repos.listForOrg({org: org.login, per_page: 2});
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
        console.log('####################### Started Github Backup Process #######################\n');
        const repositories = await getRepoList();
        let count = 0;
        repositories.forEach(async (repository, index) => {
            let username = repository.owner.login;
            let repo = repository.name;

            //Check if the repository exists on codecommit.Create a repository if it doesn't exists.
            codecommit.getRepository({ repositoryName: `${username}_${repo}` }, function (err, data) {
                if (err) {
                    if (err.code === 'RepositoryDoesNotExistException') {
                        if (repository.description) {
                            if (repository.description != "")
                                child_process.execSync(`aws codecommit create-repository --repository-name ${username}_${repo} --repository-description "${(repository.description) ? repository.description : ''}"`);
                            else
                                child_process.execSync(`aws codecommit create-repository --repository-name ${username}_${repo}`);
                        } else
                            child_process.execSync(`aws codecommit create-repository --repository-name ${username}_${repo}`);
                    }
                }
            });

            //Get repository branches list from the github
            const branches = (await octokit.rest.repos.listBranches({ owner: repository.owner.login, repo: repository.name })).data;

            branches.forEach(async branch => {
                //Check if the local backup is exists. Clone the repository and push content to the codecommit if the local backup doesn't exists
                if (!fs.existsSync(`${config.LOCAL_BACKUP_PATH}/repos/${username}/${repo}`)) {
                    child_process.execSync(`git clone https://${username}:${config.GITHUB_ACCESS_TOKEN}@github.com/${username}/${repo}.git ${config.LOCAL_BACKUP_PATH}/repos/${username}/${repo}`);
                    child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`);
                    child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${repository.owner.login}_${repository.name} --all`);
                    console.log(`${repo} Repository ${branch.name} Branch Cloned\n`);
                } else {
                    child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`);
                    child_process.execSync(`cd ${config.LOCAL_BACKUP_PATH}/repos/${repository.owner.login}/${repository.name} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${repository.owner.login}_${repository.name} --all`);
                    console.log(`${repository.name} Repository ${branch.name} Branch Updated\n`);
                }
            });

            //If the github repository default branch is not the default branch in codecommit. set it to the original default branch.
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
                    if(branches.filter(b => b.name === cb)){
                        console.log(`${cb} exists`);
                    }
                });
            });

            count++;
        });

        //Wait until the end of the backup process
        const interval = setInterval(function () {
            if (count === repositories.length) {
                console.log('\n####################### Completed Github Backup Process #######################\n');
                clearInterval(interval);
                return null;
            }
        }, 2000);
    } catch (e) {
        return e;
    }
}

module.exports.init = async () => {
    await backupProcess();
};