pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        IMAGE_NAME = "lilyqyuhn/ngurra-flora"
    }

    stages {
        stage('Build') {
            steps {
                script {
                    def imageTag = "${env.GIT_COMMIT.take(7)}-${env.BUILD_NUMBER}"
                    env.IMAGE_TAG = imageTag

                    sh "docker build -t ${IMAGE_NAME}:${imageTag} -t ${IMAGE_NAME}:latest ."

                    sh "echo \$DOCKERHUB_CREDENTIALS_PSW | docker login -u \$DOCKERHUB_CREDENTIALS_USR --password-stdin"

                    sh "docker push ${IMAGE_NAME}:${imageTag}"
                    sh "docker push ${IMAGE_NAME}:latest"
                }
            }
        }
        stage('Test') {
            steps {
                sh "docker compose -p ngurra-testing -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner"
            }
            post {
                always {
                    sh "docker compose -p ngurra-testing -f docker-compose.test.yml down -v"
                }
            }
        }
        stage('Code Quality') {
            steps {
                sh "docker network create ci-network || true"
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
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
        stage('Security') {
            steps {
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
                always {
                    archiveArtifacts artifacts: 'trivy-report.txt', allowEmptyArchive: true
                }
            }
        }
        stage('Deploy') {
            steps {
                sh "docker network create monitoring-net || true"
                sh "docker network create staging-net || true"

                withCredentials([file(credentialsId: 'env-staging', variable: 'ENV_STAGING_FILE')]) {
                    sh "cp \$ENV_STAGING_FILE .env.staging"

                    sh "docker pull ${IMAGE_NAME}:${IMAGE_TAG}"

                    // create the database first
                    sh "docker compose -p ngurra-staging -f docker-compose.staging.yml down" // force a recreation
                    sh "docker compose -p ngurra-staging -f docker-compose.staging.yml up -d --wait db"

                    // run migrations on the database using the builder image
                    // (in a temp container) which has the dev dependencies
                    sh "docker build --target builder -t ngurra-migrator:${BUILD_NUMBER} ."
                    sh """
                        docker run --rm \
                        --network staging-net \
                        --env-file .env.staging \
                        ngurra-migrator:${BUILD_NUMBER} \
                        npx prisma migrate deploy --schema=src/prisma/schema.prisma
                    """

                    // create the app once the database is ready
                    sh "docker compose -p ngurra-staging -f docker-compose.staging.yml up -d app"

                    // confirm the app is healthy -> successful deployment
                    sh """
                        docker run --rm --network staging-net curlimages/curl -sf --retry 10 --retry-delay 5 --retry-connrefused http://app:3000/health
                    """
                }
            }
        }
        stage('Release') {
            steps {
                sh "docker network create prod-net || true"

                script {
                    // record the previous image tag before release so rollback is possible
                    def previousTag = sh(
                        script: "docker inspect --format='{{.Config.Image}}' ngurra-flora-pipeline-app-1 2>/dev/null || echo 'none (first deployment)'",
                        returnStdout: true
                    ).trim()
                    writeFile file: 'rollback-info.txt', text: "Previous production image before this release: ${previousTag}\nReleased: ${IMAGE_NAME}:${IMAGE_TAG}\nBuild: ${BUILD_NUMBER}\n"
                    archiveArtifacts artifacts: 'rollback-info.txt'
                }

                withCredentials([file(credentialsId: 'env-production', variable: 'ENV_PROD_FILE')]) {
                    sh "cp \$ENV_PROD_FILE .env.production"

                    sh "docker compose -p ngurra-production -f docker-compose.production.yml down"
                    sh "docker compose -p ngurra-production -f docker-compose.production.yml up -d --wait db"

                    sh "docker build --target builder -t ngurra-migrator:${BUILD_NUMBER} ."
                    sh """
                        docker run --rm \
                        --network prod-net \
                        --env-file .env.production \
                        ngurra-migrator:${BUILD_NUMBER} \
                        npx prisma migrate deploy --schema=src/prisma/schema.prisma
                    """

                    sh "docker compose -p ngurra-production -f docker-compose.production.yml up -d app"

                    sh """
                        docker run --rm --network prod-net curlimages/curl -sf --retry 10 --retry-delay 5 --retry-connrefused http://app:3000/health
                    """
                }
            }
        }
        stage('Monitoring') {
            steps {
                withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
                    sh "envsubst < alertmanager.template.yml > alertmanager.yml"
                }

                sh "docker build -t ngurra-prometheus:latest -f Dockerfile.prometheus ."
                sh "docker build -t ngurra-alertmanager:latest -f Dockerfile.alertmanager ."

                // sh "docker network create monitoring-net || true"
                sh "docker compose -f docker-compose.monitoring.yml up -d"

                sh """
                    docker run --rm --network monitoring-net curlimages/curl -f -G \
                    'http://prometheus:9090/api/v1/query' \
                    --data-urlencode 'query=up{job="ngurra-production"}' \
                    | grep -qF '"1"]'
                """
            }
        }
    }
}