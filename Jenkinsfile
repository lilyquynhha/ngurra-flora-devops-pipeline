pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        IMAGE_NAME = "lilyqyuhn/ngurra-flora"
    }

    stages {
        // --- Build Docker image and push to DockerHub
        stage('Build') {
            steps {
                script {
                    def imageTag = "${env.GIT_COMMIT.take(7)}-${env.BUILD_NUMBER}" // tag by git commit hash + build number
                    env.IMAGE_TAG = imageTag

                    sh "docker build -t ${IMAGE_NAME}:${imageTag} -t ${IMAGE_NAME}:latest ." // tag current image as latest as well

                    // push to DockerHub
                    sh "echo \$DOCKERHUB_CREDENTIALS_PSW | docker login -u \$DOCKERHUB_CREDENTIALS_USR --password-stdin"
                    sh "docker push ${IMAGE_NAME}:${imageTag}"
                    sh "docker push ${IMAGE_NAME}:latest"
                }
            }
        }

        // --- Run test (Vitest + Supertest) in a temp test compose stack
        stage('Test') {
            steps {
                // stop all running containers if any container stops (so once test-runner finishes, test-db is automatically stopped)
                // return exit status code of test-runner to determine whether this stage should pass
                sh "docker compose -p ngurra-testing -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner"
            }
            post {
                // remove the test compose stack once done (regardless of passed/failed result)
                always {
                    sh "docker compose -p ngurra-testing -f docker-compose.test.yml down -v"
                }
            }
        }

        // --- Perform code quality analysis using SonarQube
        stage('Code Quality') {
            steps {
                sh "docker network create ci-network || true" // shared network for the Jenkins and SonarQube containers

                withSonarQubeEnv("My SonarQube Server") {
                    withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
                        sh """
                            docker run --rm \
                            --network ci-network \
                            -u root \
                            -v jenkins_home:/var/jenkins_home \
                            -w \$WORKSPACE \
                            sonarsource/sonar-scanner-cli \
                            -Dsonar.token=\$SONAR_TOKEN \
                            -Dsonar.host.url=\$SONAR_HOST_URL \
                            -Dsonar.working.directory=\$WORKSPACE/.scannerwork
                        """
                    }                    
                }
                // stop the pipeline if the quality gate failed
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // --- Perform security scanning with Trivy
        stage('Security') {
            steps {
                // flag issues with CRITICAL/HIGH severity and produce the report
                sh """
                    docker run --rm \
                    -u root \
                    -v jenkins_home:/var/jenkins_home \
                    -w \$WORKSPACE \
                    aquasec/trivy image \
                    --exit-code 1 \
                    --severity CRITICAL,HIGH \
                    --ignorefile .trivyignore \
                    --format table \
                    --output trivy-report.txt \
                    ${IMAGE_NAME}:${IMAGE_TAG}
                """
            }
            post {
                // save the trivy report as a build artefact
                always {
                    archiveArtifacts artifacts: 'trivy-report.txt', allowEmptyArchive: true
                }
            }
        }

        // --- Deploy the app to the staging environment (Docker compose stack)
        stage('Deploy') {
            steps {
                sh "docker network create monitoring-net || true" // same network with monitoring tools for later in the Monitoring stage
                sh "docker network create staging-net || true" // network for the database and app in the staging compose stack

                withCredentials([file(credentialsId: 'env-staging', variable: 'ENV_STAGING_FILE')]) {
                    sh "cp \$ENV_STAGING_FILE .env.staging" // env variables containing DATABASE_URL

                    // pull the image from DockerHub
                    sh "docker pull ${IMAGE_NAME}:${IMAGE_TAG}"

                    // create the database first
                    sh "docker compose -p ngurra-staging -f docker-compose.staging.yml down" // delete any existing stack to recreate it
                    sh "docker compose -p ngurra-staging -f docker-compose.staging.yml up -d --wait db"

                    // run migrations on the database
                    sh "docker build --target builder -t ngurra-migrator:${BUILD_NUMBER} ." // use the builder image which has dev dependencies
                    sh """
                        docker run --rm \
                        --network staging-net \
                        --env-file .env.staging \
                        ngurra-migrator:${BUILD_NUMBER} \
                        npx prisma migrate deploy --schema=src/prisma/schema.prisma
                    """

                    // create the app once the database is ready
                    sh "docker compose -p ngurra-staging -f docker-compose.staging.yml up -d app"

                    // confirm the app is healthy
                    sh """
                        docker run --rm --network staging-net curlimages/curl -sf --retry 10 --retry-delay 5 --retry-connrefused http://app:3000/health
                    """
                }
            }
        }

        // --- Release the app to the production environment (Docker compose stack)
        stage('Release') {
            steps {
                sh "docker network create prod-net || true"  // network for the database and app in the production compose stack

                script {
                    // record the previous image tag before release to support rollback
                    def previousTag = sh(
                        script: "docker inspect --format='{{.Config.Image}}' ngurra-flora-pipeline-app-1 2>/dev/null || echo 'none (first deployment)'",
                        returnStdout: true
                    ).trim()

                    // save the info file as a build artefact
                    writeFile file: 'rollback-info.txt', text: "Previous production image before this release: ${previousTag}\nReleased: ${IMAGE_NAME}:${IMAGE_TAG}\nBuild: ${BUILD_NUMBER}\n"
                    archiveArtifacts artifacts: 'rollback-info.txt'
                }

                withCredentials([file(credentialsId: 'env-production', variable: 'ENV_PROD_FILE')]) {
                    sh "cp \$ENV_PROD_FILE .env.production" // env variables containing DATABASE_URL

                    // create the database first
                    sh "docker compose -p ngurra-production -f docker-compose.production.yml down" // delete any existing stack to recreate it
                    sh "docker compose -p ngurra-production -f docker-compose.production.yml up -d --wait db"

                    // run migrations on the database
                    sh "docker build --target builder -t ngurra-migrator:${BUILD_NUMBER} ." // use the builder image which has dev dependencies
                    sh """
                        docker run --rm \
                        --network prod-net \
                        --env-file .env.production \
                        ngurra-migrator:${BUILD_NUMBER} \
                        npx prisma migrate deploy --schema=src/prisma/schema.prisma
                    """

                    // create the app once the database is ready
                    sh "docker compose -p ngurra-production -f docker-compose.production.yml up -d app"

                    // confirm the app is healthy
                    sh """
                        docker run --rm --network prod-net curlimages/curl -sf --retry 10 --retry-delay 5 --retry-connrefused http://app:3000/health
                    """
                }
            }
        }

        // --- Monitoring 
        stage('Monitoring') {
            steps {
                // fill the alert manager template with the SLACK_WEBHOOK_URL
                withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
                    sh "envsubst < alertmanager.template.yml > alertmanager.yml"
                }

                // build the Prometheus and alert manager images
                sh "docker build -t ngurra-prometheus:latest -f Dockerfile.prometheus ."
                sh "docker build -t ngurra-alertmanager:latest -f Dockerfile.alertmanager ."

                // create the monitoring compose stack: Prometheus + alert manager + Grafana
                sh "docker compose -p ngurra-monitoring -f docker-compose.monitoring.yml up -d"

                // confirm Prometheus reports the production app is up
                sh """
                    for i in \$(seq 1 12); do
                        RESULT=\$(docker run --rm --network monitoring-net curlimages/curl -sf -G \
                        'http://prometheus:9090/api/v1/query' \
                        --data-urlencode 'query=up{job="ngurra-production"}')

                        if echo "\$RESULT" | grep -qF '"1"]'; then
                            echo "Production app confirmed up in Prometheus (attempt \$i)."
                            exit 0
                        fi

                        echo "Attempt \$i/12: not yet reporting up, retrying in 10s..."
                        sleep 10
                    done

                    echo "Production app did not report as up in Prometheus after 2 minutes."
                    exit 1
                """
            }
        }
    }
}