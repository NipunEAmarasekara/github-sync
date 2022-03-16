const config = require('./config');
const child_process = require('child_process');
const { Octokit } = require("@octokit/rest");
const aws = require('aws-sdk');
const fs = require("fs");

let response = null;

const octokit = new Octokit({
    auth: config.GITHUB_ACCESS_TOKEN,
});

aws.config.credentials = new aws.Credentials(config.AWS_CC_ACCESS_KEY, config.AWS_CC_ACCESS_SECRET);
var codecommit = new aws.CodeCommit({ apiVersion: '2015-04-13', region: 'us-east-1' });

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

async function backupProcess() {
    try {
        console.log('####################### Started Github Backup Process #######################\n');
        const repositories = await getRepoList();
        let count = 0;
        repositories.forEach(async (repository, index) => {
            let username = repository.owner.login;
            let repo = repository.name;

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
            const branches = (await octokit.rest.repos.listBranches({ owner: repository.owner.login, repo: repository.name })).data;
            branches.forEach(async branch => {
                fs.access(`~/Downloads/repos/${username}/${repo}`, function (error) {
                    try {
                        if (error) {
                            if (error.code === 'ENOENT') {
                                child_process.execSync(`git clone https://${username}:${config.GITHUB_ACCESS_TOKEN}@github.com/${username}/${repo}.git ~/Downloads/repos/${username}/${repo}`);
                                child_process.execSync(`cd ~/Downloads/repos/${username}/${repo} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`);
                                child_process.execSync(`cd ~/Downloads/repos/${username}/${repo} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${username}_${repo} --all`);
                                console.log(`\n${repo} Repository ${branch.name} Branch Cloned\n`);
                            }
                        } else {
                            child_process.execSync(`cd ~/Downloads/repos/${username}/${repo} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`);
                            child_process.execSync(`cd ~/Downloads/repos/${username}/${repo} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${username}_${repo} --all`);
                            console.log(`${repo} Repository ${branch.name} Branch Updated\n`);
                        }
                    } catch (e) {
                        child_process.execSync(`cd ~/Downloads/repos/${username}/${repo} && git fetch && git checkout ${branch.name} && git pull origin ${branch.name}`);
                        child_process.execSync(`cd ~/Downloads/repos/${username}/${repo} && git push ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/${username}_${repo} --all`);
                        console.log(`${repo} Repository ${branch.name} Branch Updated\n`);
                        //console.log(e);
                    }
                    if (branch.name == 'main' || branch.name == 'master') {
                        try {
                            codecommit.updateDefaultBranch({ defaultBranchName: branch.name, repositoryName: `${username}_${repo}` }, function (err, data) {
                                console.log(err);
                            });
                        } catch (e) {
                            console.log(e);
                        }
                    }
                });
            });
            count++;
        });
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