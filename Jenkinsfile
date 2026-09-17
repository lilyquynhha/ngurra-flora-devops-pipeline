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
    }
}