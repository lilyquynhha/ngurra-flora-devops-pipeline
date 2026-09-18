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
                sh "docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner"
            }
            post {
                always {
                    sh "docker compose -f docker-compose.test.yml down -v"
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
                    docker run --rm aquasec/trivy image \
                    -u root \
                    -v jenkins_home:/var/jenkins_home \
                    -w \$WORKSPACE \
                    --exit-code 1 \
                    --severity CRITICAL,HIGH \
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
    }
}