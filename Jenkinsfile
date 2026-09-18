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
                withSonarQubeEnv() {
                    withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
                        sh """
                            docker run --rm \
                            --network ci-network \
                            -v jenkins_home:/var/jenkins_home \
                            -w \$WORKSPACE \
                            sonarsource/sonar-scanner-cli \
                            -Dsonar.host.url=http://sonarqube:9000 \
                            -Dsonar.token=\$SONAR_TOKEN
                        """
                    }                    
                }
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
    }
}