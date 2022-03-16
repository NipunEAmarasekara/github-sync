# Github-Sync
Express application to backup github repositories to aws codecommit

# Setup

    Install npm packages

        npm i

    Run the developement server

        npm start

    Export executable for mac, linux and windows

        npm run build
        
    Set below keys with values as environment variables (check .envExample file)
    
        GITHUB_ACCESS_TOKEN
        LOCAL_BACKUP_PATH
        AWS_CC_ACCESS_KEY
        AWS_CC_ACCESS_SECRET
        AWS_CC_SSH_KEY
