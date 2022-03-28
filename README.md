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

    Commands

        Execute the sync program only one time but syncs to all systems (Testing purposes)
            
            ./executable onetime

        Execute the sync program only one time but syncs to a specific system (cc = codecommit)

            ./executable onetime ( s3/cc )

        Execute the sync program only one time but syncs to local only

            ./executable onetime none

        Execute the sync program using the scheduler.

            ./executable

            ./executable ( s3/cc )

            ./executable none